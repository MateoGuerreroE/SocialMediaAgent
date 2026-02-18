import { ConsoleLogger, Injectable } from '@nestjs/common';
import { AgentEntity, AgentSessionEntity, ConversationEntity } from 'src/types/entities';
import { AgentService } from '../Agent.service';
import { ConversationService } from 'src/messaging';

@Injectable()
export class CrmIntegrationHandler {
  constructor(
    private readonly logger: ConsoleLogger,
    private readonly agentService: AgentService,
    private readonly conversationService: ConversationService,
  ) {}
  // This is a placeholder for where you would implement integration with a CRM system.
  async handle({ conversation, agent }: { conversation: ConversationEntity; agent: AgentEntity }) {
    let session: AgentSessionEntity;

    if (!conversation.activeAgentSessionId) {
      session = await this.agentService.createAgentSession({
        conversationId: conversation.conversationId,
        agentId: agent.agentId,
        agentKey: agent.agentKey,
      });
      this.logger.log(
        `Created new agent session with ID ${session.sessionId} for conversation ${conversation.conversationId}`,
      );

      await this.conversationService.updateConversationSession(
        conversation.conversationId,
        session.sessionId,
      );
    } else {
      if (!conversation.session) {
        this.logger.error(
          `Conversation ${conversation.conversationId} has an activeAgentSessionId but no session data`,
        );
        return;
      }
      session = conversation.session;
    }
  }

  private async handleConfirmData({
    agent,
    conversation,
    session,
  }: {
    agent: AgentEntity;
    conversation: ConversationEntity;
    session: AgentSessionEntity;
  }) {
    const confirmDataFields = session.state.confirmDataFields;
  }
}
