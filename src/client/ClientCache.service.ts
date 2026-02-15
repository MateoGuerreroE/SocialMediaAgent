import { Injectable, Logger } from '@nestjs/common';
import { Platform } from '../generated/prisma/enums';
import { ClientEntity } from '../types/entities';
import { RedisService } from '../data';

@Injectable()
export class ClientCacheService {
  constructor(private readonly redis: RedisService) {}
  readonly TTL = 604800; // 1 week cache
  readonly logger = new Logger(ClientCacheService.name);

  async get(accountId: string, platform: Platform): Promise<ClientEntity | null> {
    try {
      const key = this.buildKey(accountId, platform);
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

  async set(accountId: string, platform: Platform, client: ClientEntity): Promise<void> {
    try {
      const key = this.buildKey(accountId, platform);
      await this.redis.setex(key, this.TTL, JSON.stringify(client));
      this.logger.log(`Cache SET for ${platform}:${accountId}`);
    } catch (error) {
      this.logger.error(`Cache SET error: ${error instanceof Error ? error.message : error}`);
      // Don't throw - caching is not critical
    }
  }

  async invalidate(client: ClientEntity): Promise<void> {
    try {
      const keysToDelete: string[] = [];

      // Invalidate Instagram cache if account exists
      if (client.instagramAccountId) {
        keysToDelete.push(this.buildKey(client.instagramAccountId, Platform.INSTAGRAM));
      }

      // Invalidate Facebook cache if account exists
      if (client.facebookAccountId) {
        keysToDelete.push(this.buildKey(client.facebookAccountId, Platform.FACEBOOK));
      }

      if (keysToDelete.length > 0) {
        const deleted = await this.redis.del(...keysToDelete);
        this.logger.log(
          `Cache INVALIDATE: Deleted ${deleted} cache entries for clientId: ${client.clientId}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Cache INVALIDATE error: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * Build cache key from platform account ID
   * Format: client:instagram:123456 or client:facebook:789012
   * This allows direct lookup by accountId + platform without DB query
   */
  private buildKey(accountId: string, platform: Platform): string {
    return `client:${platform}:${accountId}`;
  }
}
