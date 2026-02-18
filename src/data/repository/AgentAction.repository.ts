import { Injectable } from '@nestjs/common';
import { PrismaService } from '../Prisma.service';

@Injectable()
export class AgentActionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getAgentActionsByAgentId(agentId: string) {
    return this.prisma.agentAction.findMany({
      where: { agentId },
    });
  }
}
