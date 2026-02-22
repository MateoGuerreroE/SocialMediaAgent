import { Injectable } from '@nestjs/common';
import { PrismaService } from '../Prisma.service';
import { CreateConversation } from '../../types/transactions';
import { ConversationEntity } from '../../types/entities';
import { PlatformChannel } from 'src/generated/prisma/enums';

@Injectable()
export class ConversationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async retrieveConversationBySenderIdAndChannel(
    senderId: string,
    channel: PlatformChannel,
    postId?: string,
  ) {
    return this.prisma.conversation.findFirst({
      where: { senderId, channel, postId },
      include: {
        messages: {
          orderBy: { receivedAt: 'desc' },
          take: 10,
        },
        session: true,
      },
    });
  }

  async updateConversationPause(conversationId: string, pausedUntil: Date | null) {
    await this.prisma.conversation.update({
      where: { conversationId },
      data: { pausedUntil },
    });
  }

  async updateConversationStatus(
    conversationId: string,
    updates: { activeAgentSessionId?: string | null; lastMessageAt?: Date; isConfirmed?: boolean },
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
