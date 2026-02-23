import { ConsoleLogger, Injectable } from '@nestjs/common';
import { ConfirmationAssistantData, RequiredField } from '../types';
import { ReplyAction } from '../actions/Reply.action';
import { ConversationService } from '../../messaging';
import { GenerationService } from '../../generation';
import { CommunityManagerHandler } from './CommunityManager.handler';
import { AgentKey } from '../../generated/prisma/enums';
import {
  ClientEntity,
  ClientPlatformEntity,
  ConversationEntity,
  PlatformCredentialEntity,
} from 'src/types/entities';

@Injectable()
export class ConfirmationAssistantHandler {
  constructor(
    private readonly logger: ConsoleLogger,
    private readonly replyAction: ReplyAction,
    private readonly generationService: GenerationService,
    private readonly conversationService: ConversationService,
    private readonly communityManagerHandler: CommunityManagerHandler,
  ) {}

  async handle({
    platform,
    conversation,
    targetId,
    credential,
    client,
  }: ConfirmationAssistantData) {
    if (!conversation.messages || conversation.messages.length === 0) {
      this.logger.warn(`No messages found in conversation ${conversation.conversationId}`);
      return;
    }

    const confirmConfigs = platform.platformConfig?.confirmation;
    if (!confirmConfigs) {
      this.logger.warn(
        `Confirm Assistant does not have confirmation configuration for platform ${platform.platformId}`,
      );
      return;
    }
    const { question, flaggedPath } = confirmConfigs;
    const requiredField: RequiredField = {
      key: 'confirms',
      type: 'string',
      options: ['yes', 'no', 'unrelated'],
      isRequired: true,
    };

    const lastMessage = conversation.messages[0];
    const extractedInfo = await this.generationService.extractFieldsFromResponse(
      [requiredField],
      conversation.messages.slice(0, 2), // Only look at the last 2 messages for confirmation
      `You are confirming the response to the following question: ${question}. Extract whether the user has confirmed (yes), denied (no), or if the response is unrelated to the confirmation question.`,
    );

    if (!extractedInfo || extractedInfo.length === 0) {
      this.logger.error(
        `No confirmation found in messages, unable to proceed with confirmation, defaulting to confirmed`,
      );

      await this.conversationService.confirmConversation(conversation.conversationId, true);
    }

    const extractedValue = extractedInfo[0];
    if (extractedValue.confidence < 0.7) {
      extractedValue.value = 'unrelated';
    }

    switch (extractedValue.value.toLowerCase()) {
      case 'yes':
      case 'no': {
        if (extractedValue.value.toLowerCase() === flaggedPath) {
          await this.executeFlaggedPath({
            conversation,
            targetId,
            lastMessageContent: lastMessage.content,
            credential,
          });
        } else {
          await this.executeConfirmedPath({
            conversation,
            targetId,
            credential,
            client,
            platform,
          });
        }
        break;
      }
      case 'unrelated': {
        this.logger.log(`No confirmation found in messages, asking for confirmation`);

        const generatedReply = await this.generationService.simpleGenerate(
          `Generate a reply greeting the user and asking them to confirm the following question: ${question}. Language of the reply should base on the user message.\nThis is the last message received from the user: ${lastMessage.content}. `,
        );

        await this.replyAction.execute({
          platform: conversation.platform,
          target: targetId,
          credential,
          channel: conversation.channel,
          message: generatedReply,
        });

        await this.conversationService.addAgentMessage(
          conversation,
          'confirmation_agent',
          generatedReply,
        );
        break;
      }
    }
  }

  async routeToCommunityManager(data: ConfirmationAssistantData) {
    const { client } = data;
    const cmAgent = client.agents?.find((agent) => agent.agentKey === AgentKey.COMMUNITY_MANAGER);

    if (!cmAgent) {
      this.logger.error(
        `No community manager agent found for client ${client.clientId}, unable to route conversation`,
      );
      return;
    }

    await this.communityManagerHandler.handle({
      client,
      conversation: data.conversation,
      agent: cmAgent,
      credential: data.credential,
      targetId: data.targetId,
      routingContext:
        'Conversation was routed from confirmation assistant. Acknowledge the user and reply accordingly or offer assistance',
    });
  }

  private async executeConfirmedPath({
    conversation,
    targetId,
    credential,
    client,
    platform,
  }: {
    conversation: ConversationEntity;
    targetId: string;
    client: ClientEntity;
    platform: ClientPlatformEntity;
    credential: PlatformCredentialEntity;
  }) {
    this.logger.log(`User confirmed conversation, routing to community manager`);
    await this.conversationService.confirmConversation(conversation.conversationId, true);

    await this.routeToCommunityManager({
      client,
      platform,
      conversation,
      credential,
      targetId,
    });
  }

  private async executeFlaggedPath({
    credential,
    conversation,
    lastMessageContent,
    targetId,
  }: {
    conversation: ConversationEntity;
    targetId: string;
    lastMessageContent: string;
    credential: PlatformCredentialEntity;
  }) {
    this.logger.log(
      `User denied confirmation, flagging convrsation and notifying user that someone will be in touch shortly`,
    );
    const generatedMessage = await this.generationService.simpleGenerate(
      `Acknowledge the last response from user and let them know that someone would be in touch on this conversation shortly. Last message: ${lastMessageContent}`,
    );

    await this.replyAction.execute({
      platform: conversation.platform,
      target: targetId,
      credential,
      channel: conversation.channel,
      message: generatedMessage,
    });

    await this.conversationService.addAgentMessage(
      conversation,
      'confirmation_agent',
      generatedMessage,
    );

    await this.conversationService.confirmConversation(conversation.conversationId, false);
  }
}
