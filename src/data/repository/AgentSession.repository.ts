import { Injectable } from '@nestjs/common';
import { PrismaService } from '../Prisma.service';
import { CreateAgentSession } from 'src/types/transactions';
import { AgentSessionEntity } from 'src/types/entities';

@Injectable()
export class AgentSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createAgentSession(agentSession: CreateAgentSession): Promise<AgentSessionEntity> {
    return this.prisma.agentSession.create({
      data: agentSession,
    });
  }

  async updateAgentSession(sessionId: string, updates: Partial<AgentSessionEntity>): Promise<void> {
    await this.prisma.agentSession.update({
      where: { sessionId },
      data: updates,
    });
  }
}
