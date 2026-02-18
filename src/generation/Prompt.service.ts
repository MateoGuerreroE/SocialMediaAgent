import { Injectable } from '@nestjs/common';
import {
  AgentEntity,
  ClientEntity,
  ClientEventEntity,
  ConversationMessageEntity,
} from '../types/entities';
import { Utils } from 'src/utils';
import { ReplyRules } from './types';

const GENERATION_CONSTANTS = {
  TIMEZONE: 'America/New_York',
  AGENT_DECISION: `You are an orchestration agent that is proficient in deciding which agent should handle a given conversation. You have access to the following agents, each with their own use case and examples:`,
  AGENT_CLIENT_RESPONSE: `You are a Community Manager agent for social media channels, and you respond to clients following rules and context defined per client. You may receive conversation history, make sure to use It to contextualize your responses and make them feel natural and human.`,
};

@Injectable()
export class PromptService {
  /**
   * Format conversation history into a readable string for the model
   * @param client The client entity
   * @param history Optional conversation history
   * @returns Formatted conversation string or empty string if no history
   */
  formatConversationHistory(history?: ConversationMessageEntity[]): string {
    if (!history?.length) return '';

    const formattedMessages = history
      .map((m) => `${m.sentBy}: ${m.content} (${Utils.getMessageDate(m.receivedAt)})`)
      .join('\n');

    return `\n\nCurrent conversation (newest first):\n${formattedMessages}\n---- END of conversation history ----`;
  }

  getSystemPromptForClientResponse(client: ClientEntity, replyRules: ReplyRules): string {
    const clientContext = this.getClientContext(client);
    const replyRulesContext = this.getReplyRules(replyRules);
    const systemPrompt = `${GENERATION_CONSTANTS.AGENT_CLIENT_RESPONSE}\n\nClient context:\n${clientContext}\n\nReply rules:\n${replyRulesContext}`;

    return systemPrompt;
  }

  /**
   * Build system context prompt from client and action configuration
   * @param client The client entity
   * @param actionConfiguration Response action configuration
   * @returns Formatted system context JSON string
   */
  private getClientContext(client: ClientEntity): string {
    return `
      =================================== START
      CLIENT_CONTEXT: {
        "businessName": "${client.businessName}",
        "industry": "${client.industry}",
        "businessDescription": "${client.businessDescription}",
        "businessHours": "${client.businessHours}",
        "businessLocation": "${client.businessLocation}",
        "contactOptions": "${client.contactOptions}",
        "dynamicInformation": ${client.dynamicInformation ? `"${client.dynamicInformation}"` : 'null'}
      }
      =================================== END`;
  }

  private getReplyRules(rules: ReplyRules): string {
    return `
    =================================== START
      REPLY_RULES: {
        "maxCharacterLength": ${rules.maxCharacters ?? 'null'},
        "tone": "${rules.tone}",
        "instructions": "${rules.replyInstructions}",
        "greetingStyle": "${rules.greetingStyle}",
        "intention": "${rules.intention}",
        "emojiUsage": "${rules.emojiUsage}",
        "avoidTopics": ${rules.avoidTopics ? JSON.stringify(rules.avoidTopics) : 'null'},
        "onAvoidedTopics": "${rules.onAvoidedTopics ?? ''}",
        "onEmptyMessage": "${rules.onEmptyMessage ?? ''}",
        "onProfanity": "${rules.profanity ?? 'none'}"
      }
    =================================== END`;
  }

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

  getClientEventsPrompt(events: ClientEventEntity[]): string {
    if (events.length === 0) return '';

    const formattedEvents = events
      .map(
        (event) => `    {
      "eventName": "${event.eventName}",
      "recurrence": "${event.recurrence}",
      "details": "${event.description}",
      "startDate": "${event.startDate ? event.startDate.toISOString() : 'N/A'}",
      "endDate": "${event.endDate ? event.endDate.toISOString() : 'N/A'}"
    }`,
      )
      .join(',\n');

    return `
    =================================== START
    UPCOMING_EVENTS: [
${formattedEvents}
    ]
    =================================== END
    
    Take these events into account when crafting your response. If a customer asks about events, promotions, or availability, reference these dates and details.`;
  }

  getAlertGenerationSystemPrompt(): string {
    return `You are a alert system agent that takes a reason and a conversation history and crafts an alert message that will be sent to a human through different channels. The message should be concise, clear, and provide enough context for the human to understand the situation without overwhelming them with information.`;
  }
}
