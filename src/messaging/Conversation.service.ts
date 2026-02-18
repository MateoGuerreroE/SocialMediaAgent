import { ConsoleLogger, Injectable } from '@nestjs/common';
import { ConversationMessageRepository, ConversationRepository } from '../data/repository';
import { SocialMediaEvent } from '../types/messages';
import { ConversationEntity } from '../types/entities';
import { CreateMessage } from '../types/transactions';
import { ApplicationActor, MessageSource, OriginalContentType } from '../generated/prisma/enums';

@Injectable()
export class ConversationService {
  constructor(
    private readonly logger: ConsoleLogger,
    private readonly conversationRepository: ConversationRepository,
    private readonly conversationMessageRepository: ConversationMessageRepository,
  ) {}

  async updateConversationSession(conversationId: string, sessionId: string | null) {
    await this.conversationRepository.updateConversationStatus(conversationId, {
      activeAgentSessionId: sessionId,
    });
  }

  async getOrCreateConversation(
    event: SocialMediaEvent,
    clientId: string,
  ): Promise<ConversationEntity> {
    const { metadata } = event;

    const conversation = await this.conversationRepository.retrieveConversationBySenderId(
      metadata.sender.id,
      metadata.postId,
    );

    if (conversation) {
      return conversation as ConversationEntity;
    }

    this.logger.log(
      `No conversation found, creating new conversation for sender ${metadata.sender.id}`,
    );

    return this.conversationRepository.createConversation({
      senderId: metadata.sender.id,
      accountId: event.accountId,
      parentId: event.metadata.parentId,
      commentSourceId: event.metadata.postId
        ? `${metadata.postId}_${metadata.sender.id}`
        : undefined,
      postId: event.metadata.postId,
      clientId,
      senderUserName: metadata.sender.username || metadata.sender.username,
      platform: event.platform,
      channel: event.channel,
      lastMessageAt: new Date(),
    });
  }

  async addUserMessage(conversation: ConversationEntity, event: SocialMediaEvent): Promise<void> {
    const message: CreateMessage = {
      conversationId: conversation.conversationId,
      content: event.content.text,
      originalContentType: event.content.originalType,
      externalId: event.metadata.externalId,
      messageId: event.messageId,
      sentBy: ApplicationActor.USER,
      source: MessageSource.DIRECT,
      originalSourceUrl: event.content.originalContentUrl,
      agentSessionId: conversation.activeAgentSessionId ?? undefined,
    };

    const newMessage = await this.conversationMessageRepository.createMessage(message);
    await this.conversationRepository.updateConversationStatus(conversation.conversationId, {
      lastMessageAt: new Date(),
    });

    conversation.messages = conversation.messages
      ? [newMessage, ...conversation.messages]
      : [newMessage];
  }

  async addAgentMessage(
    conversation: ConversationEntity,
    agentId: string,
    content: string,
  ): Promise<void> {
    const message: CreateMessage = {
      conversationId: conversation.conversationId,
      content,
      originalContentType: OriginalContentType.TEXT,
      sentBy: ApplicationActor.AGENT,
      source: MessageSource.DIRECT,
      messageId: crypto.randomUUID(),
      externalId: agentId,
      agentSessionId: conversation.activeAgentSessionId ?? undefined,
    };

    await this.conversationMessageRepository.createMessage(message);
  }

  async deleteMessage(externalId: string): Promise<void> {
    const message = await this.conversationMessageRepository.findByExternalId(externalId);
    if (!message) {
      this.logger.warn(`Message with externalId ${externalId} not found for deletion`);
      return;
    }
    await this.conversationMessageRepository.deleteMessage(message.messageId);
  }

  async checkIfMessageExists(externalId: string): Promise<boolean> {
    return this.conversationMessageRepository.checkIfMessageExists(externalId);
  }

  async pauseConversation(conversationId: string): Promise<void> {
    const pausedUntil = new Date(Date.now() + 60 * 12 * 60 * 1000); // Pause for 12 hours
    await this.conversationRepository.updateConversationPause(conversationId, pausedUntil);
  }

  async resumeConversation(conversationId: string): Promise<void> {
    await this.conversationRepository.updateConversationPause(conversationId, null);
  }
}
