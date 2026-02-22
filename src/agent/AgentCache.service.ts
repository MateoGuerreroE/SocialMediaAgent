import { ConsoleLogger, Injectable } from '@nestjs/common';
import { RedisService } from 'src/data';
import { AgentActionEntity, AgentEntity } from 'src/types/entities';

@Injectable()
export class AgentCacheService {
  readonly ACTIONS_TTL = 3600 * 6; // 6 hour cache for agent actions
  readonly AGENT_TTL = 3600 * 12; // 12 hour cache for agent data
  constructor(
    private readonly logger: ConsoleLogger,
    private readonly redis: RedisService,
  ) {}

  async getAgent(agentId: string) {
    try {
      const key = this.buildAgentKey(agentId);
      const cached = await this.redis.get(key);

      if (!cached) {
        return null;
      }

      return JSON.parse(cached);
    } catch (error) {
      this.logger.error(`Agent cache GET error: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  async setAgent(agentId: string, agentData: AgentEntity): Promise<void> {
    try {
      const key = this.buildAgentKey(agentId);
      await this.redis.setex(key, this.AGENT_TTL, JSON.stringify(agentData));
      this.logger.log(`Agent cache SET for ${agentId}`);
    } catch (error) {
      this.logger.error(`Agent cache SET error: ${error instanceof Error ? error.message : error}`);
    }
  }

  async getAgentActions(agentId: string): Promise<AgentActionEntity[] | null> {
    try {
      const key = this.buildActionsKey(agentId);
      const cached = await this.redis.get(key);

      if (!cached) {
        return null;
      }

      return JSON.parse(cached) as AgentActionEntity[];
    } catch (error) {
      this.logger.error(
        `Agent actions cache GET error: ${error instanceof Error ? error.message : error}`,
      );
      return null;
    }
  }

  async setAgentActions(agentId: string, actions: AgentActionEntity[]): Promise<void> {
    try {
      const key = this.buildActionsKey(agentId);
      await this.redis.setex(key, this.ACTIONS_TTL, JSON.stringify(actions));
      this.logger.log(`Agent actions cache SET for ${agentId}`);
    } catch (error) {
      this.logger.error(
        `Agent actions cache SET error: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  async invalidateAgentActions(agentId: string): Promise<void> {
    try {
      const keyToDelete = this.buildActionsKey(agentId);
      await this.redis.del(keyToDelete);
      this.logger.log(`Agent actions cache INVALIDATE for ${agentId}`);
    } catch (e) {
      this.logger.error(
        `Agent actions cache INVALIDATE error: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  private buildAgentKey(agentId: string): string {
    return `agent:${agentId}`;
  }

  private buildActionsKey(agentId: string): string {
    return `agent-actions:${agentId}`;
  }
}
