import { ConsoleLogger, Injectable } from '@nestjs/common';
import { AgentEntity, ClientEntity, ConversationMessageEntity } from '../types/entities';
import { ExpectedModelResponseFormat, GenerationModel } from './models/model';
import { PromptService } from './Prompt.service';
import { AgentDecisionResponse, ReplyRules } from './types';

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
    conversationHistory: ConversationMessageEntity[],
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

  private parseModelResponse<T>(response: string, expectedFormat: ExpectedModelResponseFormat): T {
    let parsed: unknown;
    try {
      parsed = JSON.parse(response.trim());
    } catch (error) {
      throw new Error(
        `Failed to parse model response as JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Model response must be a JSON object.');
    }

    for (const field of expectedFormat) {
      if (!(field.key in parsed)) {
        throw new Error(`Model response is missing expected field: ${field.key}`);
      }
      const value = parsed[field.key];
      switch (field.type) {
        case 'string':
          if (typeof value !== 'string') {
            throw new Error(`Field ${field.key} is expected to be a string.`);
          }
          if (field.options && !field.options.includes(value)) {
            throw new Error(
              `Field ${field.key} has an invalid value. Expected one of: ${field.options.join(', ')}`,
            );
          }
          break;
        case 'number':
          if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
            throw new Error(`Field ${field.key} is expected to be a number.`);
          }
          break;
        case 'boolean':
          if (typeof value !== 'boolean') {
            throw new Error(`Field ${field.key} is expected to be a boolean.`);
          }
          break;
        default:
          throw new Error(`Unsupported field type: ${field.type as string}`);
      }
    }

    return parsed as T;
  }

  async generateAlertMessage(
    conversationMessages: ConversationMessageEntity[],
    reason: string,
  ): Promise<string> {
    const history = this.promptService.formatConversationHistory(conversationMessages);
    const systemPrompt = this.promptService.getAlertGenerationSystemPrompt();

    const prompt = `Given the following conversation history: ${history}\n\nAnd the reason for alerting: "${reason}"\n\nProvide a short (max 100 characters) message to sent to client to alert them about the situation.`;
    const generatedMessage = await this.model.sendToModel({
      prompt,
      systemPrompt,
    });

    return generatedMessage;
  }
}
