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

  async deleteMessage(messageId: string): Promise<void> {
    await this.prisma.conversationMessage.update({
      where: { messageId },
      data: { isDeleted: true, deletedAt: new Date() },
    });
  }
}
