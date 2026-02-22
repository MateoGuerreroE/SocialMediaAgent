import { ConsoleLogger, Injectable } from '@nestjs/common';
import { ConfirmationAssistantData, RequiredField } from '../types';
import { ReplyAction } from '../actions/Reply.action';
import { ConversationService } from '../../messaging';
import { GenerationService } from '../../generation';

@Injectable()
export class ConfirmationAssistantHandler {
  constructor(
    private readonly logger: ConsoleLogger,
    private readonly replyAction: ReplyAction,
    private readonly generationService: GenerationService,
    private readonly conversationService: ConversationService,
  ) {}

  async handle({ platform, conversation, targetId, credential }: ConfirmationAssistantData) {
    if (!conversation.messages || conversation.messages.length === 0) {
      this.logger.warn(`No messages found in conversation ${conversation.conversationId}`);
      return;
    }

    const confirmationQuestion = platform.confirmationConfig.question;
    const requiredField: RequiredField = {
      key: 'confirms',
      type: 'string',
      options: ['yes', 'no', 'unrelated'],
      isRequired: true,
    };

    const lastMessage = conversation.messages[0];
    this.logger.debug(`Last message for confirmation: ${JSON.stringify(lastMessage, null, 2)}`);
    const extractedInfo = await this.generationService.extractFieldsFromResponse(
      [requiredField],
      [lastMessage], // Only look at the most recent message for confirmation
      `You are confirming the response to the following question: ${confirmationQuestion}. Extract whether the user has confirmed (yes), denied (no), or if the response is unrelated to the confirmation question.`,
    );

    this.logger.debug(`Extracted confirmation info: ${JSON.stringify(extractedInfo, null, 2)}`);

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
      case 'yes': {
        const reply = await this.generationService.simpleGenerate(
          `You just received confirmation, and internally next messages would be redirected to the proper agent. Based on last user response, generate a acknowledgement of the received information and ask politely what can you help the user with\nLast message: ${lastMessage.content}`,
        );

        await this.replyAction.execute({
          platform: conversation.platform,
          target: targetId,
          credential,
          channel: conversation.channel,
          message: reply,
        });

        await this.conversationService.addAgentMessage(conversation, 'confirmation_agent', reply);

        await this.conversationService.confirmConversation(conversation.conversationId, true);
        break;
      }
      case 'no': {
        this.logger.log(`User denied the confirmation, flagging conversation`);
        const generatedMessage = await this.generationService.simpleGenerate(
          `Acknowledge the last response from user and let them know that someone would be in touch on this conversation shortly. Last message: ${lastMessage.content}`,
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
        break;
      }
      case 'unrelated': {
        this.logger.log(`No confirmation found in messages, asking for confirmation`);

        const generatedReply = await this.generationService.simpleGenerate(
          `Generate a reply greeting the user and asking them to confirm the following question: ${confirmationQuestion}. Language of the reply should base on the user message.\nThis is the last message received from the user: ${lastMessage.content}. `,
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
}
