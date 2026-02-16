export interface CreateAgentLog {
  logId: string;
  agentId: string;
  messageId: string;
  reason: string;
  decisionScore: number;
  conversationId: string;
  message: string;
  metadata: any;
}
