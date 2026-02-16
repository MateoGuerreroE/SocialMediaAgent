import { Injectable } from '@nestjs/common';
import { PrismaService } from '../Prisma.service';
import { AgentKey } from '../../generated/prisma/enums';
import { CreateConversation } from '../../types/transactions';
import { ConversationEntity } from '../../types/entities';

@Injectable()
export class ConversationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async retrieveConversationBySenderId(senderId: string, postId?: string) {
    return this.prisma.conversation.findFirst({
      where: { senderId, postId },
      include: {
        messages: {
          orderBy: { receivedAt: 'desc' },
          take: 10,
        },
        session: true,
      },
    });
  }

  async updateConversationPause(conversationId: string, pausedUntil: Date) {
    await this.prisma.conversation.update({
      where: { conversationId },
      data: { pausedUntil },
    });
  }

  async updateConversationStatus(
    conversationId: string,
    updates: { activeAgentKey?: AgentKey; activeAgentSessionId?: string; lastMessageAt?: Date },
  ) {
    await this.prisma.conversation.update({
      where: { conversationId },
      data: updates,
    });
  }

  async createConversation(data: CreateConversation): Promise<ConversationEntity> {
    return this.prisma.conversation.create({
      data,
    });
  }
}
