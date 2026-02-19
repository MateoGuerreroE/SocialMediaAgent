import { Injectable } from '@nestjs/common';
import { PrismaService } from '../Prisma.service';
import { CreateMessage } from '../../types/transactions';
import { ConversationMessageEntity } from '../../types/entities';

@Injectable()
export class ConversationMessageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createMessage(entity: CreateMessage): Promise<ConversationMessageEntity> {
    return this.prisma.conversationMessage.create({
      data: entity,
    });
  }

  async findByExternalId(externalId: string): Promise<ConversationMessageEntity | null> {
    return this.prisma.conversationMessage.findFirst({
      where: { externalId },
    });
  }

  async checkIfMessageExists(externalId: string): Promise<boolean> {
    const count = await this.prisma.conversationMessage.count({
      where: { externalId },
    });

    return count > 0;
  }

  async deleteMessage(messageId: string): Promise<void> {
    await this.prisma.conversationMessage.update({
      where: { messageId },
      data: { isDeleted: true, deletedAt: new Date() },
    });
  }

  async getMessagesBySessionId(
    conversationId: string,
    sessionId: string,
  ): Promise<ConversationMessageEntity[]> {
    return this.prisma.conversationMessage.findMany({
      where: { agentSessionId: sessionId, conversationId },
      orderBy: { receivedAt: 'desc' },
    });
  }

  async updateMessageSession(messageId: string, sessionId: string): Promise<void> {
    await this.prisma.conversationMessage.update({
      where: { messageId },
      data: { agentSessionId: sessionId },
    });
  }
}
