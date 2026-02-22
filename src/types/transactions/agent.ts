import { AgentKey, AgentSessionStatus } from 'src/generated/prisma/enums';

export interface CreateAgentLog {
  logId: string;
  agentId: string;
  messageId: string;
  reason: string;
  decisionScore: number;
  conversationId: string;
  message: string;
}

export interface CreateAgentSession {
  sessionId: string;
  agentId: string;
  agentKey: AgentKey;
  status: AgentSessionStatus;
  conversationId: string;
  state: any;
}
