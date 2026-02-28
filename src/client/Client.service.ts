import { ConsoleLogger, Injectable } from '@nestjs/common';
import {
  ClientPlatformRepository,
  ClientEventRepository,
  ClientRepository,
  ClientCredentialRepository,
} from '../data/repository';
import {
  CreateClient,
  CreateClientDTO,
  CreateClientEventDTO,
  CreateClientPlatformDTO,
  CreateCredentialDTO,
  UpdateClientEventDTO,
  UpdateClientPayload,
  UpdateClientPlatformDTO,
  UpdateCredentialDTO,
} from '../types/transactions';
import { ConflictError, NotFoundError } from '../types/errors';
import { Platform } from '../generated/prisma/enums';
import { ClientEntity, ClientPlatformEntity } from '../types/entities';
import { ClientCacheService } from './ClientCache.service';

@Injectable()
export class ClientService {
  constructor(
    private readonly clientRepository: ClientRepository,
    private readonly clientPlatformRepository: ClientPlatformRepository,
    private readonly clientEventRepository: ClientEventRepository,
    private readonly clientCacheService: ClientCacheService,
    private readonly clientCredentialRepository: ClientCredentialRepository,
    private readonly logger: ConsoleLogger,
  ) {}

  async getAllClients(): Promise<ClientEntity[]> {
    const clients = await this.clientRepository.getAllClients();
    return clients;
  }

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

    await this.clientCacheService.invalidate(client.clientId);
  }

  async getCompleteClientById(clientId: string): Promise<ClientEntity> {
    const client = await this.clientRepository.getClientById(clientId, true);
    if (!client) {
      throw new NotFoundError(`Client with ID ${clientId} not found.`);
    }
    const platforms = await this.clientPlatformRepository.getAllPlatformsByClientId(clientId);
    return {
      ...client,
      platforms,
    };
  }

  private async verifyClientDoesNotExist({ businessName }: { businessName: string }) {
    const clientByName = await this.clientRepository.getClientByBusinessName(businessName);

    if (clientByName) {
      throw new ConflictError(`Client with business name ${businessName} already exists.`);
    }
  }

  async getClientById(clientId: string): Promise<ClientEntity> {
    const cachedClient = await this.clientCacheService.getClient(clientId);
    if (cachedClient) {
      this.logger.log(`Cache HIT for client:${clientId}`);
      return cachedClient;
    }
    this.logger.log(`Cache MISS for client:${clientId}`);
    const client = await this.clientRepository.getClientById(clientId, true);

    if (!client) {
      throw new NotFoundError(`Client with ID ${clientId} not found.`);
    }

    await this.clientCacheService.setClient(clientId, client);

    return client;
  }

  // Credentials
  async updateClientCredential(credentialId: string, updates: UpdateCredentialDTO) {
    const credential = await this.clientCredentialRepository.getCredentialById(credentialId);
    if (!credential) {
      throw new NotFoundError(`Client credential with ID ${credentialId} not found.`);
    }
    await this.clientCredentialRepository.updateCredential({
      credentialId,
      ...updates,
    });
  }

  async createClientCredential(dto: CreateCredentialDTO) {
    const { clientId } = dto;
    const client = await this.clientRepository.getClientById(clientId, false);
    if (!client) {
      throw new NotFoundError(`Client with ID ${clientId} not found.`);
    }

    const credentialId = crypto.randomUUID();
    return this.clientCredentialRepository.createCredential({
      credentialId,
      ...dto,
    });
  }

  async deleteCredential(credentialId: string) {
    const credential = await this.clientCredentialRepository.getCredentialById(credentialId);
    if (!credential) {
      throw new NotFoundError(`Client credential with ID ${credentialId} not found.`);
    }
    await this.clientCredentialRepository.deleteCredential(credentialId);
  }

  // Platform
  async getPlatformByAccountId(
    accountId: string,
    platform: Platform,
  ): Promise<ClientPlatformEntity> {
    const cachedPlatform = await this.clientCacheService.getClientPlatform(accountId);
    if (cachedPlatform) {
      this.logger.log(`Cache HIT for platform account:${accountId}`);
      return cachedPlatform;
    }
    this.logger.log(`Cache MISS for platform account:${accountId}`);
    const platformResult = await this.clientPlatformRepository.retrievePlatformByAccount(
      platform,
      accountId,
    );

    if (!platformResult) {
      throw new NotFoundError(`No client platform found for ${platform} account ID ${accountId}`);
    }

    await this.clientCacheService.setClientPlatform(accountId, platformResult);

    return platformResult;
  }

  async createPlatform(dto: CreateClientPlatformDTO) {
    const client = await this.clientRepository.getClientById(dto.clientId);
    if (!client) {
      throw new NotFoundError(`Client with ID ${dto.clientId} not found.`);
    }

    const existentPlatform = await this.clientPlatformRepository.getByPlatformAndClientId(
      dto.platform,
      dto.clientId,
    );

    if (existentPlatform) {
      throw new ConflictError(
        `Platform ${dto.platform} already exists for client with ID ${dto.clientId}.`,
      );
    }

    const platformId = crypto.randomUUID();

    return this.clientPlatformRepository.createClientPlatform({
      ...dto,
      platformId,
    });
  }

  async updateClientPlatform(platformId: string, updates: UpdateClientPlatformDTO) {
    const platform = await this.clientPlatformRepository.getByPlatformId(platformId);
    if (!platform) {
      throw new NotFoundError(`Client platform with ID ${platformId} not found.`);
    }

    await this.clientPlatformRepository.updateClientPlatform({
      platformId,
      ...updates,
    });
  }

  async getPlatformById(platformId: string): Promise<ClientPlatformEntity> {
    const platform = await this.clientPlatformRepository.getByPlatformId(platformId);
    if (!platform) {
      throw new NotFoundError(`Client platform with ID ${platformId} not found.`);
    }
    return platform;
  }

  // Events
  async createClientEvent(clientId: string, dto: CreateClientEventDTO) {
    const client = await this.clientRepository.getClientById(clientId);
    if (!client) {
      throw new NotFoundError(`Client with ID ${clientId} not found.`);
    }

    const eventId = crypto.randomUUID();

    const event = await this.clientEventRepository.createEvent({
      eventId,
      ...dto,
    });

    await this.clientCacheService.invalidate(client.clientId);
    return event;
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

    await this.clientCacheService.invalidate(event.clientId);
  }

  async deleteEvent(eventId: string) {
    const event = await this.clientEventRepository.getEventById(eventId);
    if (!event) {
      throw new NotFoundError(`Client event with ID ${eventId} not found.`);
    }

    await this.clientEventRepository.deleteEvent(eventId);
  }

  // Whatsapp specific
  async getAllClientsWithWhatsappPlatform(): Promise<ClientEntity[]> {
    const platforms = await this.clientPlatformRepository.getAllPlatformsByPlatform(
      Platform.WHATSAPP,
    );
    const clients: ClientEntity[] = [];
    for (const platform of platforms) {
      const client = await this.getClientById(platform.clientId);
      clients.push({
        ...client,
        platforms: [platform],
      });
    }
    return clients;
  }
}
