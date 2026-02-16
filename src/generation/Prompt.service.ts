import { Injectable } from '@nestjs/common';
import { AgentEntity } from '../types/entities';

const GENERATION_CONSTANTS = {
  TIMEZONE: 'America/New_York',
  AGENT_DECISION_INSTRUCTION: `You are an orchestration agent that is proficient in deciding which agent should handle a given conversation. You have access to the following agents, each with their own use case and examples:`,
};

@Injectable()
export class PromptService {
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

    return `${GENERATION_CONSTANTS.AGENT_DECISION_INSTRUCTION}\n${JSON.stringify(
      agentDescriptions,
      null,
      2,
    )}`;
  }
}
