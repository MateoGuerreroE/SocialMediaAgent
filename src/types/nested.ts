import { ReplyRules } from 'src/generation/types';

export interface AgentConfiguration {
  modelTier: number;
  replyRules: ReplyRules;
  examples?: Array<{
    message: string;
    isCorrect: boolean;
    reasoning: string;
  }>;
}

export type AgentConfigOverride = Partial<AgentConfiguration>;
