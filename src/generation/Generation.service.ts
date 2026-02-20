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
import { Utils } from 'src/utils';
import { AgentConfiguration } from 'src/types/nested';

@Injectable()
export class GenerationService {
  constructor(
    private readonly logger: ConsoleLogger,
    private readonly promptService: PromptService,
    private readonly model: GenerationModel,
  ) {}

  async generateResponseWithClientContext({
    client,
    configuration,
    agentName,
    conversationHistory,
    promptOverride,
  }: {
    client: ClientEntity;
    configuration: AgentConfiguration;
    agentName: string;
    conversationHistory?: ConversationMessageEntity[];
    promptOverride?: string;
  }) {
    const { replyRules, modelTier } = configuration;
    const systemPrompt = this.promptService.getSystemPromptForClientResponse(
      client,
      replyRules,
      agentName,
    );
    const history = this.promptService.formatConversationHistory(conversationHistory);

    const prompt = `${promptOverride ?? 'Given the following conversation, provide the client an appropiate response:'}${history}${client.events?.length ? '\n\n' + this.promptService.getClientEventsPrompt(client.events) : ''}`;

    this.logger.debug(`System prompt: ${systemPrompt}`);
    this.logger.debug(`User prompt: ${prompt}`);
    const generatedResponse = await this.model.sendToModel({
      prompt,
      systemPrompt,
      modelTier,
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

    this.logger.debug(`Parsing model response: ${generatedResult}`);
    const result = Utils.parseModelResponse<AgentDecisionResponse>(generatedResult, expectedFormat);

    return result;
  }

  async generateAlertMessage(
    reason: string,
    modelTier: number,
    conversationMessages?: ConversationMessageEntity[],
  ): Promise<string> {
    const history = this.promptService.formatConversationHistory(conversationMessages);
    const systemPrompt = this.promptService.getAlertGenerationSystemPrompt();

    const prompt = `Given the following conversation history: ${history}\n\nAnd the reason for alerting: "${reason}"\n\nProvide a short (max 100 characters) message to sent to client to alert them about the situation. The message should not contain subtitle or formatting, just the message itself.`;
    const generatedMessage = await this.model.sendToModel({
      prompt,
      systemPrompt,
      modelTier,
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

    this.logger.debug(`Parsing model response: ${generatedResult}`);
    const result = Utils.parseModelResponse<ActionDecisionResponse>(
      generatedResult,
      expectedFormat,
    );

    return result;
  }

  async generateEscalationMessage(
    reason: string,
    modelTier: number,
    conversationMessages?: ConversationMessageEntity[],
  ): Promise<string> {
    const history = this.promptService.formatConversationHistory(conversationMessages);
    const systemPrompt = `You are a community manager agent that provides social media responses based on the given prompt. Use the conversation history to contextualize and decide the language of the response. You have just escalated this conversation with the user.`;
    const prompt = `Given the following conversation history: ${history}\n\nAnd the reason for escalation: "${reason}"\n\nProvide a short message acknowledging the client and letting the user know that the situation has been escalated and that they will be contacted by a human agent soon. The message should be empathetic and concise, with a maximum of 100 characters.`;

    const generatedMessage = await this.model.sendToModel({
      prompt,
      systemPrompt,
      modelTier,
    });

    return generatedMessage;
  }

  async extractFieldsFromResponse(
    requiredFields: RequiredField[],
    conversationMessages: ConversationMessageEntity[],
  ): Promise<RetrievedField[]> {
    const history = this.promptService.formatConversationHistory(conversationMessages);
    const systemPrompt = `You are a data extraction agent. Your task is to extract specific pieces of information from the conversation history based on the required fields provided.`;
    const prompt = `Given the following conversation history: ${history}\n\nExtract the following required fields: ${this.promptService.getRequiredFieldsFormat(requiredFields)}\n\nFor each field, return an object with three properties:\n- "key": the field identifier (string)\n- "value": the extracted value converted to a string (even for boolean/number types)\n- "confidence": your confidence in the extraction (number between 0 and 1)\n\nIf a field cannot be extracted, set value to an empty string and confidence to 0.`;

    // Expected format for RetrievedField objects
    const expectedFormat: ExpectedModelResponseFormat = [
      { key: 'key', type: 'string' },
      { key: 'value', type: 'string' },
      { key: 'confidence', type: 'number' },
    ];

    const generatedResult = await this.model.sendToModel({
      prompt,
      systemPrompt,
      expectedFormat,
      isExpectedFormatArray: true,
    });

    this.logger.debug(`Parsing model response: ${generatedResult}`);
    const result = Utils.parseModelResponse<RetrievedField[]>(
      generatedResult,
      expectedFormat,
      true,
    );

    return result;
  }

  async simpleGenerate(prompt: string): Promise<string> {
    const generated = await this.model.sendToModel({
      prompt,
      systemPrompt: `You are a community manager agent that provides social media responses based on the given prompt.`,
    });

    return generated;
  }

  async requestDataReply({
    client,
    configuration,
    conversationMessages,
    requiredFields,
    additionalContext,
    agentName,
  }: {
    client: ClientEntity;
    configuration: AgentConfiguration;
    conversationMessages: ConversationMessageEntity[];
    requiredFields: RequiredField[];
    additionalContext?: string;
    agentName: string;
  }) {
    const { replyRules, modelTier } = configuration;
    const systemPrompt = this.promptService.getRequestDataSystemPrompt(
      client,
      agentName,
      replyRules,
      requiredFields,
    );
    const history = this.promptService.formatConversationHistory(conversationMessages);
    const prompt = `Given the following conversation history: ${history}\n\nAnd the client context and reply rules: ${systemPrompt}\n\nCraft a response to the user that attempts to obtain the missing information needed to provide further assistance.${additionalContext ? `\n\nAdditionalContext: ${additionalContext}` : ''}`;

    this.logger.debug(`System prompt: ${systemPrompt}`);
    this.logger.debug(`User prompt: ${prompt}`);
    const generatedResponse = await this.model.sendToModel({
      prompt,
      systemPrompt,
      modelTier,
    });

    return generatedResponse;
  }

  async generateConversationSummary(
    conversationMessages: ConversationMessageEntity[],
  ): Promise<string> {
    const history = this.promptService.formatConversationHistory(conversationMessages);
    const systemPrompt = `You are a community manager assistant that summarizes conversation histories. Given the conversation history, you provide concise summaries that capture the main points of conversation`;
    const prompt = `Given the following conversation history: ${history}\n\nProvide a concise summary of the main points of this conversation. Maximum 200 characters.`;

    const generatedSummary = await this.model.sendToModel({
      prompt,
      systemPrompt,
    });

    return generatedSummary;
  }
}
