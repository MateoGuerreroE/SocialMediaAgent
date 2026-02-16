import { Injectable } from '@nestjs/common';
import { PrismaService } from '../Prisma.service';
import { CreateAgentLog } from 'src/types/transactions';

@Injectable()
export class AgentLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createLog(logEntity: CreateAgentLog): Promise<string> {
    const result = await this.prisma.agentLog.create({
      select: { logId: true },
      data: logEntity,
    });

    return result.logId;
  }
}
