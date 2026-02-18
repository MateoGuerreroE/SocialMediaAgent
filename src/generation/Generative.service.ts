import { ConsoleLogger, Injectable } from '@nestjs/common';
import {
  AgentActionEntity,
  AgentEntity,
  ClientEntity,
  ConversationMessageEntity,
} from '../types/entities';
import { ExpectedModelResponseFormat, GenerationModel } from './models/model';
import { PromptService } from './Prompt.service';
import { ActionDecisionResponse, AgentDecisionResponse, ReplyRules } from './types';
import { RequiredField, RetrievedField } from 'src/agent/types';

@Injectable()
export class GenerativeService {
  constructor(
    private readonly logger: ConsoleLogger,
    private readonly promptService: PromptService,
    private readonly model: GenerationModel,
  ) {}

  async generateResponseWithClientContext(
    client: ClientEntity,
    replyRules: ReplyRules,
    conversationHistory?: ConversationMessageEntity[],
  ) {
    const systemPrompt = this.promptService.getSystemPromptForClientResponse(client, replyRules);
    const history = this.promptService.formatConversationHistory(conversationHistory);

    const prompt = `Given the following conversation, provide the client an appropiate response:${history}${client.events?.length ? '\n\n' + this.promptService.getClientEventsPrompt(client.events) : ''}`;

    const generatedResponse = await this.model.sendToModel({
      prompt,
      systemPrompt,
    });

    return generatedResponse;
  }

  async requestAgentDecision(
    agents: AgentEntity[],
    content: string,
  ): Promise<AgentDecisionResponse> {
    const expectedFormat: ExpectedModelResponseFormat = [
      {
        key: 'agent',
        type: 'string',
        options: agents.map((agent) => agent.agentKey),
      },
      {
        key: 'decisionScore',
        type: 'number',
      },
      {
        key: 'reason',
        type: 'string',
      },
    ];

    const systemPrompt = this.promptService.getAgentDecisionSystemPrompt(agents);
    const prompt = `Given the following message: "${content}", decide which agent should handle this conversation. Respond with the agentKey of the chosen agent, a decision score between 0 and 1 indicating your confidence in the decision, and a brief reason for your choice (Max 80 characters).`;

    const generatedResult = await this.model.sendToModel({
      prompt,
      systemPrompt,
      expectedFormat,
    });

    const result = this.parseModelResponse<AgentDecisionResponse>(generatedResult, expectedFormat);

    return result;
  }

  private parseModelResponse<T>(
    response: string,
    expectedFormat: ExpectedModelResponseFormat,
    isArray: boolean = false,
  ): T {
    let parsed: unknown;
    try {
      parsed = JSON.parse(response.trim());
    } catch (error) {
      throw new Error(
        `Failed to parse model response as JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Model response must be a JSON object or array.');
    }

    // Handle array responses
    if (isArray) {
      if (!Array.isArray(parsed)) {
        throw new Error('Model response must be an array when isArray is true.');
      }

      // Validate each item in the array
      parsed.forEach((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          throw new Error(`Array item at index ${index} must be a JSON object.`);
        }
        this.validateObject(
          item as Record<string, unknown>,
          expectedFormat,
          `Array item at index ${index}`,
        );
      });

      return parsed as T;
    }

    // Handle single object responses
    if (Array.isArray(parsed)) {
      throw new Error('Model response must be a JSON object when isArray is false.');
    }

    this.validateObject(parsed as Record<string, unknown>, expectedFormat, 'Model response');
    return parsed as T;
  }

  private validateObject(
    obj: Record<string, unknown>,
    expectedFormat: ExpectedModelResponseFormat,
    context: string = 'Object',
  ): void {
    for (const field of expectedFormat) {
      if (!(field.key in obj)) {
        throw new Error(`${context} is missing expected field: ${field.key}`);
      }
      const value = obj[field.key];
      switch (field.type) {
        case 'string':
          if (typeof value !== 'string') {
            throw new Error(`${context} field ${field.key} is expected to be a string.`);
          }
          if (field.options && !field.options.includes(value)) {
            throw new Error(
              `${context} field ${field.key} has an invalid value. Expected one of: ${field.options.join(', ')}`,
            );
          }
          break;
        case 'number':
          if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
            throw new Error(`${context} field ${field.key} is expected to be a number.`);
          }
          break;
        case 'boolean':
          if (typeof value !== 'boolean') {
            throw new Error(`${context} field ${field.key} is expected to be a boolean.`);
          }
          break;
        default:
          throw new Error(`Unsupported field type: ${field.type as string}`);
      }
    }
  }

  async generateAlertMessage(
    reason: string,
    conversationMessages?: ConversationMessageEntity[],
  ): Promise<string> {
    const history = this.promptService.formatConversationHistory(conversationMessages);
    const systemPrompt = this.promptService.getAlertGenerationSystemPrompt();

    const prompt = `Given the following conversation history: ${history}\n\nAnd the reason for alerting: "${reason}"\n\nProvide a short (max 100 characters) message to sent to client to alert them about the situation. The message should not contain subtitle or formatting, just the message itself.`;
    const generatedMessage = await this.model.sendToModel({
      prompt,
      systemPrompt,
    });

    return generatedMessage;
  }

  async requestActionDecision(
    actions: AgentActionEntity[],
    conversationMessages?: ConversationMessageEntity[],
  ): Promise<ActionDecisionResponse> {
    const expectedFormat: ExpectedModelResponseFormat = [
      {
        key: 'actionType',
        type: 'string',
        options: actions.map((action) => action.actionType),
      },
      {
        key: 'decisionScore',
        type: 'number',
      },
      {
        key: 'reason',
        type: 'string',
      },
    ];

    const systemPrompt = this.promptService.getSystemPromptForActionDecision(actions);
    const history = this.promptService.formatConversationHistory(conversationMessages);
    const prompt = `Given the following conversation history: ${history}\n\nBased on the MOST RECENT message from the user (the last message in the history), choose the most appropriate action. Use the conversation history for context, but make your decision based on what the user just said in their latest message.\n\nReturn a JSON object with the keys "actionType", "decisionScore" from 0 to 1, and a short "reason" (max 100 chars) explaining why this action is appropriate for the most recent message.`;

    const generatedResult = await this.model.sendToModel({
      prompt,
      systemPrompt,
      expectedFormat,
    });

    const result = this.parseModelResponse<ActionDecisionResponse>(generatedResult, expectedFormat);

    return result;
  }

  async generateEscalationMessage(
    reason: string,
    conversationMessages?: ConversationMessageEntity[],
  ): Promise<string> {
    const history = this.promptService.formatConversationHistory(conversationMessages);
    const systemPrompt = `You are a community manager agent that provides social media responses based on the given prompt. Use the conversation history to contextualize and decide the language of the response. You have just escalated this conversation with the user.`;
    const prompt = `Given the following conversation history: ${history}\n\nAnd the reason for escalation: "${reason}"\n\nProvide a short message acknowledging the client and letting the user know that the situation has been escalated and that they will be contacted by a human agent soon. The message should be empathetic and concise, with a maximum of 100 characters.`;

    const generatedMessage = await this.model.sendToModel({
      prompt,
      systemPrompt,
    });

    return generatedMessage;
  }

  async extractFieldsFromResponse(
    requiredFields: RequiredField[],
    conversationMessages: ConversationMessageEntity[],
  ) {
    const history = this.promptService.formatConversationHistory(conversationMessages);
    const systemPrompt = `You are a data extraction agent. Your task is to extract specific pieces of information from the conversation history based on the required fields provided.`;
    const prompt = `Given the following conversation history: ${history}\n\nExtract the following required fields: ${this.promptService.getRequiredFieldsFormat(requiredFields)}\n\nReturn a JSON object with the keys corresponding to the "key" of each required field and values extracted from the conversation. If a field cannot be extracted, return an empty string for that field.`;

    const expectedFormat: ExpectedModelResponseFormat = requiredFields.map((field) => ({
      key: field.key,
      type: field.type,
      options: field.options,
    }));

    const generatedResult = await this.model.sendToModel({
      prompt,
      systemPrompt,
      expectedFormat,
      isExpectedFormatArray: true,
    });

    const result = this.parseModelResponse<RetrievedField[]>(generatedResult, expectedFormat, true);

    return result;
  }

  async simpleGenerate(prompt: string): Promise<string> {
    const generated = await this.model.sendToModel({
      prompt,
      systemPrompt: `You are a community manager agent that provides social media responses based on the given prompt.`,
    });

    return generated;
  }
}
