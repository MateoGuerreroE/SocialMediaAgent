import { Injectable } from '@nestjs/common';
import { PrismaService } from '../Prisma.service';
import { AgentEntity } from '../../types/entities';
import { AgentKey } from 'src/generated/prisma/enums';

@Injectable()
export class AgentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getAgentById(agentId: string): Promise<AgentEntity | null> {
    return this.prisma.clientAgent.findUnique({
      where: {
        agentId,
      },
      include: {
        variants: true,
      },
    }) as Promise<AgentEntity | null>;
  }

  async getAgentsByClientId(clientId: string): Promise<AgentEntity[]> {
    return this.prisma.clientAgent.findMany({
      where: {
        clientId: clientId,
      },
    }) as unknown as Promise<AgentEntity[]>;
  }

  async getClientAgentByKey(clientId: string, key: AgentKey): Promise<AgentEntity | null> {
    return this.prisma.clientAgent.findFirst({
      where: {
        clientId,
        agentKey: key,
      },
      include: {
        variants: true,
      },
    }) as Promise<AgentEntity | null>;
  }
}
