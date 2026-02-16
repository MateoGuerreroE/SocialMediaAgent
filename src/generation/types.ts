import { AgentKey } from '../generated/prisma/enums';

export type AgentDecisionResponse = {
  agent: AgentKey;
  decisionScore: number;
  reason: string;
};
