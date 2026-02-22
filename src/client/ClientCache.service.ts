import { ConsoleLogger, Injectable } from '@nestjs/common';
import { ClientEntity, ClientPlatformEntity } from '../types/entities';
import { RedisService } from '../data';

@Injectable()
export class ClientCacheService {
  constructor(
    private readonly redis: RedisService,
    private readonly logger: ConsoleLogger,
  ) {}
  readonly TTL = 604800; // 1 week cache

  async getClient(clientId: string): Promise<ClientEntity | null> {
    try {
      const key = this.buildKey(clientId);
      const cached = await this.redis.get(key);

      if (!cached) {
        return null;
      }

      return JSON.parse(cached) as ClientEntity;
    } catch (error) {
      this.logger.error(`Cache GET error: ${error instanceof Error ? error.message : error}`);
      return null; // Fail gracefully - return null to trigger DB fetch
    }
  }

  async getClientPlatform(accountId: string): Promise<ClientPlatformEntity | null> {
    try {
      const key = this.buildPlatformKey(accountId);
      const cached = await this.redis.get(key);

      if (!cached) {
        return null;
      }

      const platformData = JSON.parse(cached) as ClientPlatformEntity;
      return platformData || null;
    } catch (error) {
      this.logger.error(`Cache GET error: ${error instanceof Error ? error.message : error}`);
      return null; // Fail gracefully - return null to trigger DB fetch
    }
  }

  async setClientPlatform(accountId: string, platformData: ClientPlatformEntity): Promise<void> {
    try {
      const key = this.buildPlatformKey(accountId);
      await this.redis.setex(key, this.TTL, JSON.stringify(platformData));
      this.logger.log(`Cache SET for platform account:${accountId}`);
    } catch (error) {
      this.logger.error(`Cache SET error: ${error instanceof Error ? error.message : error}`);
      // Don't throw - caching is not critical
    }
  }

  async setClient(clientId: string, client: ClientEntity): Promise<void> {
    try {
      const key = this.buildKey(clientId);
      await this.redis.setex(key, this.TTL, JSON.stringify(client));
      this.logger.log(`Cache SET for client:${clientId}`);
    } catch (error) {
      this.logger.error(`Cache SET error: ${error instanceof Error ? error.message : error}`);
      // Don't throw - caching is not critical
    }
  }

  async invalidate(client: ClientEntity): Promise<void> {
    try {
      const key = this.buildKey(client.clientId);
      await this.redis.del(key);
      this.logger.log(`Cache INVALIDATED for client:${client.clientId}`);
    } catch (error) {
      this.logger.error(
        `Cache INVALIDATE error: ${error instanceof Error ? error.message : error}`,
      );
      // Don't throw - cache invalidation failure is not critical
    }
  }

  /**
   * Build cache key from platform account ID
   * Format: client:instagram:123456 or client:facebook:789012
   * This allows direct lookup by accountId + platform without DB query
   */
  private buildKey(clientId: string): string {
    return `client:${clientId}`;
  }

  private buildPlatformKey(accountId: string): string {
    return `client_platform:${accountId}`;
  }
}
