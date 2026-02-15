import { Injectable } from '@nestjs/common';
import {
  ClientCredentialRepository,
  ClientEventRepository,
  ClientRepository,
} from '../data/repository';
import {
  CreateClient,
  CreateClientDTO,
  CreateClientEventDTO,
  CreateCredentialsDTO,
  UpdateClientEventDTO,
  UpdateClientPayload,
  UpdateCredentialDTO,
} from '../types/transactions';
import { ConflictError, NotFoundError } from '../types/errors';
import { Platform } from '../generated/prisma/enums';
import { ClientEntity } from '../types/entities';
import { ClientCacheService } from './ClientCache.service';

@Injectable()
export class ClientService {
  constructor(
    private readonly clientRepository: ClientRepository,
    private readonly clientCredentialsRepository: ClientCredentialRepository,
    private readonly clientEventRepository: ClientEventRepository,
    private readonly clientCacheService: ClientCacheService,
  ) {}

  async createClient(dto: CreateClientDTO) {
    await this.verifyClientDoesNotExist(dto);

    const clientId = crypto.randomUUID();
    const clientData: CreateClient = {
      clientId,
      isActive: true,
      ...dto,
    };

    return this.clientRepository.createClient(clientData);
  }

  async updateClientInformation(clientToUpdate: UpdateClientPayload): Promise<void> {
    const { clientId, ...updates } = clientToUpdate;

    const client = await this.clientRepository.getClientById(clientId, false);

    if (!client) {
      throw new NotFoundError(`Client with ID ${clientId} not found.`);
    }

    await this.clientRepository.updateClient({
      clientId: client.clientId,
      ...updates,
    });

    await this.clientCacheService.invalidate(client);
  }

  private async verifyClientDoesNotExist({
    businessName,
    instagramAccountId,
    facebookAccountId,
    whatsappNumber,
  }: {
    businessName: string;
    instagramAccountId?: string;
    facebookAccountId?: string;
    whatsappNumber?: string;
  }) {
    const clientByName = await this.clientRepository.getClientByBusinessName(businessName);

    if (clientByName) {
      throw new ConflictError(`Client with business name ${businessName} already exists.`);
    }

    if (instagramAccountId || facebookAccountId || whatsappNumber) {
      const platforms: Record<Platform, string | undefined> = {
        [Platform.INSTAGRAM]: instagramAccountId,
        [Platform.FACEBOOK]: facebookAccountId,
        [Platform.WHATSAPP]: whatsappNumber,
      };

      for (const [platformKey, accountId] of Object.entries(platforms)) {
        if (accountId) {
          const clientByAccount = await this.clientRepository.locateClientByAccount(
            platformKey as Platform,
            accountId,
          );

          if (clientByAccount) {
            throw new ConflictError(
              `Client with ${platformKey} Account ID ${accountId} already exists.`,
            );
          }
        }
      }
    }
  }

  async getClientBySocialAccount({
    accountId,
    platform,
    useCache = true,
  }: {
    accountId: string;
    platform: Platform;

    useCache?: boolean;
  }): Promise<ClientEntity> {
    //   this.logger.log(`Retrieving client for account ${accountId}`);
    let client: ClientEntity | null;
    if (useCache) {
      client = await this.clientCacheService.get(accountId, platform);
      if (client) {
        //   this.logger.log(`Cache HIT for ${platform}:${accountId}`);
        return client;
      }
    }
    //   this.logger.log(`Cache MISS for ${platform}:${accountId}`);

    client = await this.clientRepository.locateClientByAccount(platform, accountId);

    if (!client) throw new NotFoundError(`No client found for ${platform} account ID ${accountId}`);

    await this.clientCacheService.set(accountId, platform, client);

    return client;
  }

  // Credentials
  async createClientCredential(clientId: string, dto: CreateCredentialsDTO) {
    const client = await this.clientRepository.getClientById(clientId);
    if (!client) {
      throw new NotFoundError(`Client with ID ${clientId} not found.`);
    }

    const credentialId = crypto.randomUUID();

    return this.clientCredentialsRepository.createCredentials({
      clientId,
      clientCredentialId: credentialId,
      ...dto,
    });
  }

  async updateClientCredential(credentialId: string, updates: UpdateCredentialDTO) {
    const credential = await this.clientCredentialsRepository.getByCredentialId(credentialId);
    if (!credential) {
      throw new NotFoundError(`Client credential with ID ${credentialId} not found.`);
    }

    await this.clientCredentialsRepository.updateCredential({
      credentialId,
      ...updates,
    });
  }

  // Events
  async createClientEvent(clientId: string, dto: CreateClientEventDTO) {
    const client = await this.clientRepository.getClientById(clientId);
    if (!client) {
      throw new NotFoundError(`Client with ID ${clientId} not found.`);
    }

    const eventId = crypto.randomUUID();

    return this.clientEventRepository.createEvent({
      clientEventId: eventId,
      ...dto,
    });
  }

  async updateClientEvent(eventId: string, updates: UpdateClientEventDTO) {
    const event = await this.clientEventRepository.getEventById(eventId);
    if (!event) {
      throw new NotFoundError(`Client event with ID ${eventId} not found.`);
    }

    await this.clientEventRepository.updateEvent({
      clientEventId: eventId,
      ...updates,
    });
  }
}
