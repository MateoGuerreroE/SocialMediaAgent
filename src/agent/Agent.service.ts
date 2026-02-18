import { ConsoleLogger, Injectable } from '@nestjs/common';
import { AgentActionRepository } from 'src/data/repository';
import { AgentCacheService } from './AgentCache.service';
import { AgentActionEntity } from 'src/types/entities';
import { Platform, PlatformChannel } from 'src/generated/prisma/enums';

@Injectable()
export class AgentService {
  constructor(
    private readonly logger: ConsoleLogger,
    private readonly agentCacheService: AgentCacheService,
    private readonly agentActionRepository: AgentActionRepository,
  ) {}

  async getActionsByAgentId(agentId: string, useCache: boolean = true) {
    if (useCache) {
      const cached = await this.agentCacheService.getAgentActions(agentId);
      if (cached) {
        this.logger.log(`Cache HIT for agent actions ${agentId}`);
        return cached;
      }
      this.logger.log(`Cache MISS for agent actions ${agentId}`);
    }

    const actions = await this.agentActionRepository.getAgentActionsByAgentId(agentId);
    this.agentCacheService.setAgentActions(agentId, actions);
    return actions;
  }

  checkActionPolicies(
    action: AgentActionEntity,
    platform: Platform,
    channel: PlatformChannel,
  ): boolean {
    const policies = action.policies || [];
    if (policies.length === 0) {
      return true;
    }

    const exactMatch = policies.find((p) => p.platform === platform && p.channel === channel);
    if (exactMatch) return exactMatch.isAllowed;

    const platformMatch = policies.find((p) => p.platform === platform && p.channel === null);
    if (platformMatch) return platformMatch.isAllowed;

    const channelMatch = policies.find((p) => p.platform === null && p.channel === channel);
    if (channelMatch) return channelMatch.isAllowed;

    return true;
  }
}
