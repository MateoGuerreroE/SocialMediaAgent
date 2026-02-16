import { Injectable } from '@nestjs/common';
import { PrismaService } from '../Prisma.service';
import { AgentEntity } from '../../types/entities';

@Injectable()
export class AgentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getAgentsByClientId(clientId: string): Promise<AgentEntity[]> {
    return this.prisma.clientAgent.findMany({
      where: {
        clientId: clientId,
      },
    });
  }
}
