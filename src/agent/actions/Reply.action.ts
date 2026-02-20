import { ConsoleLogger, Injectable } from '@nestjs/common';
import { CredentialType, Platform, PlatformChannel } from 'src/generated/prisma/enums';
import { WhatsappService } from 'src/ingress/Whatsapp.service';
import { ClientCredentialEntity } from 'src/types/entities';
import { ConflictError } from 'src/types/errors';
import { Utils } from '../../utils';

@Injectable()
export class ReplyAction {
  constructor(
    private readonly logger: ConsoleLogger,
    private readonly whatsappService: WhatsappService,
  ) {}

  async execute({
    message,
    platform,
    channel,
    target,
    credential,
  }: {
    message: string;
    platform: Platform;
    target: string;
    channel: PlatformChannel;
    credential: ClientCredentialEntity;
  }) {
    let result: string | null = null;
    await Utils.sleep(Math.min(message.length * 25, 5000)); // Simulate typing time, max 5 seconds
    switch (platform) {
      case Platform.WHATSAPP:
        if (channel !== PlatformChannel.DIRECT_MESSAGE) {
          throw new ConflictError('WhatsApp only supports DM channel');
        }
        result = await this.replyWhatsappMessage({
          clientId: credential.clientId,
          message,
          target,
        });
        break;
      case Platform.INSTAGRAM:
      case Platform.FACEBOOK:
        if (channel === PlatformChannel.COMMENT) {
          result = await this.replyMetaComment({
            credential,
            message,
            platform,
            target,
          });
        } else if (channel === PlatformChannel.DIRECT_MESSAGE) {
          result = await this.replyMetaDM({
            credential,
            message,
            platform,
            target,
          });
        } else {
          throw new ConflictError('Invalid channel for Meta platforms');
        }
    }
    if (!result) {
      this.logger.error(`Failed to send message on platform ${platform} for target ${target}`);
    } else {
      this.logger.log(`Message sent successfully on platform ${platform} for target ${target}`);
    }
  }

  async replyWhatsappMessage({
    clientId,
    message,
    target,
  }: {
    clientId: string;
    message: string;
    target: string;
  }): Promise<string | null> {
    const socket = this.whatsappService.getSocket(clientId);
    if (!socket) {
      this.logger.error(`No WhatsApp socket found for client ${clientId}`);
      return null;
    }
    // TODO Verify If this returns any useful information that we can log, like messageId or conversationId for better traceability
    try {
      const sentMessage = await socket.sendMessage(target, {
        text: message,
      });
      this.logger.log(`Successfully sent WhatsApp message to ${target} for client ${clientId}`);
      return sentMessage?.key?.id ?? null;
    } catch (e) {
      this.logger.error(
        `Failed to send WhatsApp message to ${target} for client ${clientId}: ${e.message}`,
      );
      return null;
    }
  }

  async replyMetaDM({
    credential,
    message,
    platform,
    target,
  }: {
    message: string;
    platform: Platform;
    target: string;
    credential: ClientCredentialEntity;
  }): Promise<string | null> {
    if (platform === Platform.INSTAGRAM && credential.type !== CredentialType.APP_ACCESS_TOKEN) {
      throw new ConflictError('Invalid credential type for replying to meta DM on Instagram');
    } else if (
      platform === Platform.FACEBOOK &&
      credential.type !== CredentialType.PAGE_ACCESS_TOKEN
    ) {
      throw new ConflictError('Invalid credential type for replying to meta DM on Facebook');
    }

    const targetUrl = `https://graph.${platform === Platform.INSTAGRAM ? 'instagram' : 'facebook'}.com/v24.0/me/messages`;

    const formData = new URLSearchParams();
    formData.append('recipient', JSON.stringify({ id: target }));
    formData.append('message', JSON.stringify({ text: message }));

    const result = await this.postForm(targetUrl, formData, {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Bearer ${credential.value}`,
    });

    if (result.ok) {
      // TODO - we should also log the messageId and conversationId here for better traceability, but we need to modify the response of the API call to get that information first
      this.logger.log(`Successfully replied to meta DM on ${platform} for target ${target}`);
      return 'TODO';
    }
    this.logger.error(
      `Failed to reply to meta DM on ${platform} for target ${target}: ${JSON.stringify(result.error)}`,
    );
    return null;
  }

  async replyMetaComment({
    credential,
    message,
    platform,
    target,
  }: {
    message: string;
    platform: Platform;
    target: string;
    credential: ClientCredentialEntity;
  }): Promise<string | null> {
    if (credential.type !== CredentialType.PAGE_ACCESS_TOKEN) {
      throw new ConflictError('Invalid credential type for replying to meta comment');
    }

    const targetUrl = `https://graph.facebook.com/v24.0/${target}/${platform === Platform.INSTAGRAM ? 'replies' : 'comments'}`;

    const formData = new URLSearchParams();
    formData.append('message', message);
    formData.append('access_token', credential.value);

    const result = await this.postForm<{ id: string }>(targetUrl, formData, {
      'Content-Type': 'application/x-www-form-urlencoded',
    });

    if (result.ok) {
      this.logger.log(`Successfully replied to meta comment on ${platform} for target ${target}`);
      return result.data.id;
    }
    this.logger.error(
      `Failed to reply to meta comment on ${platform} for target ${target}: ${JSON.stringify(result.error)}`,
    );
    return null;
  }

  private async postForm<T = unknown>(
    url: string,
    formData: URLSearchParams,
    headers: Record<string, string>,
  ): Promise<{ ok: true; data: T } | { ok: false; error: unknown }> {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData.toString(),
    });

    if (response.ok) {
      return { ok: true, data: await response.json() };
    }

    const error = await this.parseErrorResponse(response);
    return { ok: false, error };
  }

  private async parseErrorResponse(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch (e) {
      this.logger.error(e instanceof Error ? e.message : e);
      return await response.text();
    }
  }
}
