import { Injectable } from '@nestjs/common';
import { PrismaService } from '../Prisma.service';
import { AgentActionEntity } from '../../types/entities';
import { AgentActionType } from '../../generated/prisma/enums';

@Injectable()
export class AgentActionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getAgentActionsByAgentId(agentId: string): Promise<AgentActionEntity<AgentActionType>[]> {
    return this.prisma.agentAction.findMany({
      where: { agentId },
    }) as unknown as Promise<AgentActionEntity<AgentActionType>[]>;
  }
}
