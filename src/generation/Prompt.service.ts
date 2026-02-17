import { Injectable } from '@nestjs/common';
import { AgentEntity, ClientEntity, ConversationMessageEntity } from '../types/entities';

const GENERATION_CONSTANTS = {
  TIMEZONE: 'America/New_York',
  AGENT_DECISION: `You are an orchestration agent that is proficient in deciding which agent should handle a given conversation. You have access to the following agents, each with their own use case and examples:`,
  AGENT_CLIENT_RESPONSE: `You are a Community Manager agent for social media channels, and you respond to clients following rules and context defined per client. You may receive conversation history, make sure to use It to contextualize your responses and make them feel natural and human.`,
};

@Injectable()
export class PromptService {
  async getRespondClientWithContextPrompt(
    client: ClientEntity,
    conversationHistory: ConversationMessageEntity[],
  ) {}

  getAgentDecisionSystemPrompt(agents: AgentEntity[]): string {
    const agentDescriptions = agents.map((agent) => {
      const examples = agent.configuration?.examples;
      const agentPayload: Record<string, unknown> = {
        agentKey: agent.agentKey,
        useCase: agent.useCase,
      };

      if (Array.isArray(examples) && examples.length > 0) {
        agentPayload.examples = examples.map((ex) => ({
          message: ex.message,
          isCorrect: ex.isCorrect,
          reasoning: ex.reasoning,
        }));
      }

      return agentPayload;
    });

    return `${GENERATION_CONSTANTS.AGENT_DECISION}\n${JSON.stringify(agentDescriptions, null, 2)}`;
  }
}
