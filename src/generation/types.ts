import { AgentKey } from '../generated/prisma/enums';

export type AgentDecisionResponse = {
  agent: AgentKey;
  decisionScore: number;
  reason: string;
};

export type ReplyRules = {
  maxCharacters?: number;
  tone: string;
  replyInstructions: string;
  greetingStyle: string;
  emojiUsage: string;
  avoidTopics?: string[];
  onAvoidedTopics?: string;
  onEmptyMessage?: string;
  intention: string;
  profanity?: string;
};
