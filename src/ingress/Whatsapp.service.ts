import { InjectQueue } from '@nestjs/bullmq';
import { ConsoleLogger, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  WASocket,
  proto,
  initAuthCreds,
  AuthenticationCreds,
  AuthenticationState,
  BufferJSON,
  SignalKeyStore,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { Queue } from 'bullmq';
import { ClientService } from 'src/client';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { ClientEntity } from 'src/types/entities';
import {
  CredentialType,
  MessageSource,
  OriginalContentType,
  Platform,
  PlatformChannel,
} from 'src/generated/prisma/enums';
import { SocialMediaEvent } from 'src/types/messages';
import { Utils } from 'src/utils';

@Injectable()
export class WhatsappService implements OnModuleInit, OnModuleDestroy {
  private sockets = new Map<string, WASocket>();
  private status = new Map<string, 'connecting' | 'open' | 'closed'>();
  private qrResolvers = new Map<string, (qr: string) => void>();
  private s3Client: S3Client;
  private bucketName: string;

  constructor(
    configService: ConfigService,
    private readonly logger: ConsoleLogger,
    private readonly clientService: ClientService,
    @InjectQueue('orchestration') private readonly orchestrationQueue: Queue,
  ) {
    const region = configService.get<string>('AWS_REGION');
    const accessKeyId = configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = configService.get<string>('AWS_SECRET_ACCESS_KEY');
    this.bucketName = configService.get<string>('AWS_S3_BUCKET_NAME', 'test');

    if (!region || !accessKeyId || !secretAccessKey) {
      this.logger.error(
        'AWS S3 credentials are not fully configured. Please check your environment variables.',
      );
      throw new Error('AWS S3 credentials are not fully configured.');
    }

    this.s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async onModuleInit() {
    const clientsWithWhatsapp = await this.clientService.getClientsWithActiveWhatsappIntegrations();
    if (clientsWithWhatsapp.length === 0) {
      this.logger.warn('No clients with active WhatsApp integrations found on startup.');
      return;
    }

    for (const client of clientsWithWhatsapp) {
      await this.attemptInitializeExistentClient(client);
    }
  }

  private async attemptInitializeExistentClient(client: ClientEntity) {
    if (this.sockets.has(client.clientId)) {
      this.logger.warn(`Client ${client.clientId} already initialized, skipping.`);
      return;
    }

    if (!client.credentials || client.credentials.length === 0) {
      this.logger.warn(
        `Client ${client.clientId} has no credentials, skipping WhatsApp initialization.`,
      );
      return;
    }

    const whatsappCredential = client.credentials.find(
      (cred) => cred.type === CredentialType.WHATSAPP_S3_BUCKET,
    );

    if (!whatsappCredential) {
      this.logger.warn(
        `Client ${client.clientId} has no WhatsApp credentials, skipping initialization.`,
      );
      return;
    }

    try {
      await this.connect(client, whatsappCredential.value);
    } catch (e) {
      this.logger.error(
        `Failed to initialize WhatsApp client for clientId ${client.clientId}: ${e.message}`,
      );
    }
  }

  private async sendToOrchestration(event: SocialMediaEvent): Promise<void> {
    await this.orchestrationQueue.add('socialMediaEvent', event, {
      jobId: event.messageId,
    });
  }

  /**
   * Initiate connection and return QR code for scanning.
   * Use this from API endpoints to onboard new clients.
   */
  async initiateConnection(clientId: string): Promise<{ qr?: string; status: string }> {
    if (this.sockets.has(clientId)) {
      return { status: 'already_connected' };
    }

    const client = await this.clientService.getClientById(clientId);
    if (!client) {
      throw new Error(`Client ${clientId} not found`);
    }

    const whatsappCredential = client.credentials?.find(
      (cred) => cred.type === CredentialType.WHATSAPP_S3_BUCKET,
    );

    if (!whatsappCredential) {
      throw new Error(`Client ${clientId} has no WhatsApp credentials`);
    }

    return new Promise((resolve) => {
      this.qrResolvers.set(clientId, (qr: string) => {
        resolve({ qr, status: 'qr_generated' });
      });

      // Start connection - QR will be captured in connection.update handler
      this.connect(client, whatsappCredential.value).catch((err) => {
        this.qrResolvers.delete(clientId);
        throw err;
      });

      // Timeout after 30 seconds if no QR
      setTimeout(() => {
        if (this.qrResolvers.has(clientId)) {
          this.qrResolvers.delete(clientId);
          // Clean up the socket if still connecting
          const sock = this.sockets.get(clientId);
          if (sock && this.status.get(clientId) !== 'open') {
            sock.end(new Error('QR timeout'));
            this.sockets.delete(clientId);
            this.status.delete(clientId);
          }
          resolve({ status: 'timeout' });
        }
      }, 30000);
    });
  }

  /**
   * Internal connection method - handles socket creation and events.
   */
  private async connect(client: ClientEntity, credentialValue: string): Promise<WASocket> {
    const { clientId } = client;
    if (this.sockets.has(clientId)) return this.sockets.get(clientId)!;

    this.status.set(clientId, 'connecting');

    const { state, saveCreds } = await this.getAuth(credentialValue);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state as AuthenticationState,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      shouldSyncHistoryMessage: () => false,
      printQRInTerminal: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (u) => {
      const { connection, lastDisconnect, qr } = u;

      if (qr) {
        this.logger.warn(`[${clientId}] QR generated`);

        // If there's a pending resolver (from API call), send QR to it
        const resolver = this.qrResolvers.get(clientId);
        if (resolver) {
          resolver(qr);
          this.qrResolvers.delete(clientId);
        } else {
          // Fallback: print to terminal (for onModuleInit flows)
          qrcode.generate(qr, { small: true });
        }
      }

      if (connection === 'open') {
        this.status.set(clientId, 'open');
        this.logger.log(`✅ [${clientId}] WhatsApp connected`);
      }

      if (connection === 'close') {
        this.status.set(clientId, 'closed');

        const code = (lastDisconnect?.error as any)?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        const authFailure =
          code === DisconnectReason.badSession || code === DisconnectReason.connectionReplaced;

        this.logger.warn(
          `⚠️ [${clientId}] connection closed (loggedOut=${loggedOut}, code=${code})`,
        );

        this.sockets.delete(clientId);

        // Only auto-reconnect for network issues, not auth failures
        if (!loggedOut && !authFailure) {
          setTimeout(() => this.connect(client, credentialValue), 1500);
        }
      }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
      const parsed = this.mapToSocialMediaEvent({
        msg: messages[0],
        accountId: client.whatsappNumber!,
      });
      if (parsed) {
        this.logger.log(`Received whatsapp message`);
        await this.sendToOrchestration(parsed);
        return;
      }
    });

    this.sockets.set(clientId, sock);
    return sock;
  }

  getStatus(clientId: string) {
    return this.status.get(clientId) ?? 'closed';
  }

  disconnect(clientId: string) {
    const sock = this.sockets.get(clientId);
    if (!sock) return;
    try {
      sock.end(new Error('Manual disconnect'));
    } finally {
      this.sockets.delete(clientId);
      this.status.set(clientId, 'closed');
    }
  }

  onModuleDestroy() {
    for (const [clientId] of this.sockets.entries()) {
      this.disconnect(clientId);
    }
  }

  async getAuth(credentialValue: string) {
    const credsKey = `${credentialValue}/creds.json`;
    let creds = await this.getCredsFromS3(credsKey);
    if (!creds) {
      creds = initAuthCreds();
    }

    const keys: SignalKeyStore = {
      get: async (type, ids) => {
        const data: any = {};
        await Promise.all(
          ids.map(async (id) => {
            const key = `${credentialValue}/keys/${type}/${id}.json`;
            const val = await this.getFromS3(key);
            if (val) {
              data[id] = JSON.parse(val, BufferJSON.reviver);
            }
          }),
        );
        return data;
      },
      set: async (data) => {
        const tasks: Promise<void>[] = [];
        for (const category in data) {
          for (const id in data[category]) {
            const value = data[category][id];
            const key = `${credentialValue}/keys/${category}/${id}.json`;
            tasks.push(this.saveToS3(key, JSON.stringify(value, BufferJSON.replacer)));
          }
        }
        await Promise.all(tasks);
      },
    };

    const saveCreds = async () => {
      await this.saveToS3(credsKey, JSON.stringify(creds, BufferJSON.replacer));
    };

    return { state: { creds, keys }, saveCreds };
  }

  private streamToBuffer(stream: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: any[] = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  private async getCredsFromS3(keyName: string): Promise<AuthenticationCreds | null> {
    const val = await this.getFromS3(keyName);
    return val ? JSON.parse(val, BufferJSON.reviver) : null;
  }

  private async getFromS3(keyName: string): Promise<string | null> {
    try {
      const val = await this.s3Client.send(
        new GetObjectCommand({ Bucket: this.bucketName, Key: keyName }),
      );
      const buffer = await this.streamToBuffer(val.Body);
      return buffer.toString();
    } catch (e) {
      this.logger.error(`Failed to get from S3: ${keyName}: ${(e as Error).message}`);
      return null;
    }
  }

  private async saveToS3(keyName: string, data: string): Promise<void> {
    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: keyName,
          Body: data,
        }),
      );
    } catch (e) {
      this.logger.error(`Failed to save to S3: ${keyName}: ${(e as Error).message}`);
    }
  }

  private mapToSocialMediaEvent({
    msg,
    accountId,
  }: {
    msg: proto.IWebMessageInfo;
    accountId: string;
  }): SocialMediaEvent | null {
    if (msg.key?.fromMe) {
      this.logger.debug('Received message from self, skipping.');
      return null;
    }

    if (!msg.message?.conversation && !msg.message?.protocolMessage) {
      this.logger.warn('Received unsupported whatsapp message type, skipping.');
      return null;
    }

    const targetId = msg.key?.remoteJid;
    if (!targetId) {
      this.logger.warn('Received message with no target ID, skipping.');
      return null;
    }

    const phoneOrId = targetId.split('@')[0];
    const messageId = Utils.generateUUID();

    const isDeleted =
      msg.message?.protocolMessage?.type === proto.Message.ProtocolMessage.Type.REVOKE;

    return {
      platform: Platform.WHATSAPP,
      channel: PlatformChannel.DIRECT_MESSAGE,
      eventType: isDeleted ? 'deleted' : 'created',
      timestamp: msg.messageTimestamp ? Number(msg.messageTimestamp) : Date.now(),
      content: {
        originalType: OriginalContentType.TEXT,
        text: msg.message.conversation || '',
      },
      accountId,
      targetId,
      messageId,
      metadata: {
        externalId: isDeleted ? (msg.message?.protocolMessage?.key?.id ?? '') : (msg.key?.id ?? ''),
        source: MessageSource.DIRECT,
        sender: {
          id: phoneOrId,
          name: undefined,
          username: undefined,
          phone: undefined,
        },
      },
    };
  }
}
