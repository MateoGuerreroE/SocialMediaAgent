import { ConsoleLogger, Injectable } from '@nestjs/common';
import {
  AgentActionRepository,
  AgentRepository,
  AgentSessionRepository,
} from 'src/data/repository';
import { AgentCacheService } from './AgentCache.service';
import { AgentEntity, AgentSessionEntity } from 'src/types/entities';
import {
  AgentKey,
  AgentSessionStatus,
  Platform,
  PlatformChannel,
} from 'src/generated/prisma/enums';
import { NotFoundError } from 'src/types/errors';
import { Utils } from 'src/utils';

@Injectable()
export class AgentService {
  constructor(
    private readonly logger: ConsoleLogger,
    private readonly agentCacheService: AgentCacheService,
    private readonly agentRepository: AgentRepository,
    private readonly agentActionRepository: AgentActionRepository,
    private readonly agentSessionRepository: AgentSessionRepository,
  ) {}

  async createAgentSession({
    conversationId,
    agentId,
    agentKey,
  }: {
    conversationId: string;
    agentId: string;
    agentKey: AgentKey;
  }): Promise<AgentSessionEntity> {
    const sessionId = Utils.generateUUID();
    // TODO Each Session must have a init state defined by the agent config?
    return this.agentSessionRepository.createAgentSession({
      sessionId,
      agentId,
      agentKey,
      conversationId,
      status: AgentSessionStatus.STARTED,
      state: {},
    });
  }

  async getAgent(agentId: string, useCache: boolean = true): Promise<AgentEntity> {
    if (useCache) {
      const cached = await this.agentCacheService.getAgent(agentId);
      if (cached) {
        this.logger.log(`Cache HIT for agent ${agentId}`);
        return cached;
      }
      this.logger.log(`Cache MISS for agent ${agentId}`);
    }

    const agent = await this.agentRepository.getAgentById(agentId);
    if (!agent) throw new NotFoundError(`Agent with ID ${agentId} not found`);

    this.agentCacheService.setAgent(agentId, agent);
    return agent;
  }

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

  checkAgentPolicies(agent: AgentEntity, platform: Platform, channel: PlatformChannel): boolean {
    const policies = agent.policies || [];
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
