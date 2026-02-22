import { ClientEntity, ClientPlatformEntity } from '../types/entities';

export interface OrchestrationCacheKey {
  platform: ClientPlatformEntity;
  client: ClientEntity;
}
