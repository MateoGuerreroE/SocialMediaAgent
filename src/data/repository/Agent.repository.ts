import { Injectable } from '@nestjs/common';
import { PrismaService } from '../Prisma.service';
import { AgentEntity } from '../../types/entities';

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
    });
  }

  async getAgentsByClientId(clientId: string): Promise<AgentEntity[]> {
    return this.prisma.clientAgent.findMany({
      where: {
        clientId: clientId,
      },
    });
  }
}
