import { ConsoleLogger, Injectable } from '@nestjs/common';
import { ReplyAction } from '../actions/Reply.action';
import { CaptureDataAction } from '../actions/CaptureData.action';
import { AlertAction } from '../actions/Alert.action';
import {
  AgentActionEntity,
  AgentEntity,
  AgentSessionEntity,
  ClientCredentialEntity,
  ClientEntity,
  ConversationEntity,
} from '../../types/entities';
import { AgentService } from '../Agent.service';
import { AgentActionType, AgentSessionStatus } from '../../generated/prisma/enums';
import { Utils } from '../../utils';
import { RetrievedField } from '../types';
import { ConversationService } from '../../messaging';
import { GenerationService } from '../../generation';
import { TemplateHelper } from '../helpers/Template.helper';

interface BookingSessionState {
  stage: 'confirm_data' | 'check_availability' | 'manage_booking' | 'send_confirmation';
  confirmedFields: RetrievedField[];
  bookingFields: RetrievedField[];
}

@Injectable()
export class BookingManagerHandler {
  private readonly requiredActionTypes: AgentActionType[] = [
    AgentActionType.VERIFY_EXTERNAL,
    AgentActionType.CAPTURE_DATA,
    AgentActionType.REPLY,
    AgentActionType.ALERT,
  ];

  private initialSessionState: BookingSessionState = {
    stage: 'confirm_data',
    confirmedFields: [],
    bookingFields: [],
  };

  constructor(
    private readonly logger: ConsoleLogger,
    private readonly replyAction: ReplyAction,
    private readonly captureAction: CaptureDataAction,
    private readonly alertAction: AlertAction,
    private readonly generationService: GenerationService,
    private readonly conversationService: ConversationService,
    private readonly agentService: AgentService,
  ) {}

  async handle({
    client,
    agent,
    targetId,
    conversation,
    credential,
  }: {
    client: ClientEntity;
    agent: AgentEntity;
    conversation: ConversationEntity;
    targetId: string;
    credential: ClientCredentialEntity;
  }) {
    const agentData = await this.agentService.getAgent(agent.agentId);
    const actions = await this.agentService.getActionsByAgentId(agentData.agentId);

    const validActions = actions.filter((a) => a.isActive);
    const { alert, captureData, verifyExternal } = this.verifyAndExtractActions({
      agent: agentData,
      actions: validActions,
    });

    Utils.mergeAgentConfigurations({
      agent: agentData,
      logger: this.logger,
      platform: conversation.platform,
      channel: conversation.channel,
    });

    const session = await this.getOrCreateSession(conversation, agentData);
    if (!session) return;

    switch (session.state.stage) {
      case 'confirm_data':
        await this.confirmData({
          client,
          agent,
          captureAction: captureData,
          credential,
          targetId,
          conversation,
          reqActions: {
            alert,
            verifyExternal,
          },
          session,
        });
        break;
      case 'check_availability':
        await this.handleError({
          error: `Availability check orphaned. This should not happen as the check is done within the confirmData step. Manual intervention may be required to assist the user.`,
          alertMessage: `An error occurred during the availability check step of a booking process. Manual intervention may be required to assist the user. Please review the conversation and assist the user manually.`,
          client,
          generationContext: `Generate a message to inform the user that unfortunately the reservation cannot be completed due to an internal problem. If there's a booking link, send It to the user so they can try to book by themselves. Apologize for the inconvenience.`,
          session,
          conversation,
          agent,
          targetId,
          credential,
          alert,
        });
        break;
      case 'manage_booking':
      case 'send_confirmation':
        this.logger.error(
          `Session stuck on send_confirmation stage, alert may require manual activation`,
        );
        this.logger.log(`Defaulting to session completion`);
        await this.conversationService.updateConversationSession(conversation.conversationId, null);
        await this.agentService.updateAgentSession(session.sessionId, {
          status: AgentSessionStatus.COMPLETED,
        });
        break;
    }
  }

  async manageBooking({
    session,
    action,
    conversation,
    alert,
    isInitial,
  }: {
    alert: AgentActionEntity<'ALERT'>;
    conversation: ConversationEntity;
    session: AgentSessionEntity;
    action: AgentActionEntity<'CAPTURE_DATA'>;
    isInitial: boolean;
  }) {
    const bookingContext = action.configuration.confirmationContext;
    const requiredFields = action.configuration.captureRequiredFields;
  }

  async sendConfirmation() {}

  async confirmData({
    client,
    agent,
    captureAction,
    credential,
    targetId,
    conversation,
    reqActions,
    session,
  }: {
    client: ClientEntity;
    agent: AgentEntity;
    targetId: string;
    captureAction: AgentActionEntity<'CAPTURE_DATA'>;
    credential: ClientCredentialEntity;
    session: AgentSessionEntity;
    reqActions: {
      alert: AgentActionEntity<'ALERT'>;
      verifyExternal: AgentActionEntity<'VERIFY_EXTERNAL'>;
    };
    conversation: ConversationEntity;
  }) {
    const confirmContext = captureAction.configuration.confirmationContext;
    const initialRequiredFields = captureAction.configuration.confirmationRequiredFields;
    const capturedFields = session.state.confirmedFields;

    if (!conversation.messages || !conversation.messages.length) {
      this.logger.warn(
        `No messages found for conversation ${conversation.conversationId} while confirming data.`,
      );
      return;
    }

    const missingStartFields = Utils.filterRequiredFields(initialRequiredFields, capturedFields);

    if (session.status === AgentSessionStatus.STARTED) {
      const requestMessage = await this.generationService.requestDataReply({
        client,
        configuration: agent.configuration,
        agentName: agent.name,
        conversationMessages: conversation.messages,
        requiredFields: missingStartFields,
        additionalContext: `This is the initial message for starting a booking process, and you'll need some info to check availability on the system`,
      });

      await this.sendAndLogMessage({
        message: requestMessage,
        conversation,
        agent,
        targetId,
        credential,
      });

      this.logger.log(`Started confirm data step. Initial request sent`);
      await this.agentService.updateAgentSession(session.sessionId, {
        status: AgentSessionStatus.PROCESSING,
      });
      return;
    }

    const { retrieved, missing } = await this.captureAction.execute({
      requiredFields: missingStartFields,
      extractionContext: confirmContext,
      messages: conversation.messages,
    });

    if (missing.length > 0) {
      const followUpMessage = await this.generationService.requestDataReply({
        client,
        conversationMessages: conversation.messages,
        requiredFields: missing,
        configuration: agent.configuration,
        agentName: agent.name,
      });

      await this.sendAndLogMessage({
        message: followUpMessage,
        conversation,
        agent,
        targetId,
        credential,
      });

      const newState = {
        ...session.state,
        confirmedFields: [...capturedFields, ...retrieved],
      };

      await this.agentService.updateAgentSession(session.sessionId, {
        state: newState,
      });
    } else {
      this.logger.log(`All required fields received for confirm data step. Moving to next step.`);
      const newState = {
        ...session.state,
        stage: 'check_availability',
        confirmedFields: [...capturedFields, ...retrieved],
      };
      await this.agentService.updateAgentSession(session.sessionId, {
        state: newState,
      });

      session.state = newState;

      const { alert, verifyExternal } = reqActions;

      await this.verifyAvailability({
        action: verifyExternal,
        capture: captureAction,
        alert,
        targetId,
        agent,
        client,
        conversation,
        credential,
        session,
      });
    }
  }

  async verifyAvailability({
    action,
    alert,
    capture,
    agent,
    credential,
    client,
    conversation,
    targetId,
    session,
  }: {
    action: AgentActionEntity<'VERIFY_EXTERNAL'>;
    alert: AgentActionEntity<'ALERT'>;
    capture: AgentActionEntity<'CAPTURE_DATA'>;
    client: ClientEntity;
    agent: AgentEntity;
    credential: ClientCredentialEntity;
    conversation: ConversationEntity;
    targetId: string;
    session: AgentSessionEntity;
  }) {
    const { targetUrl, template, expectedStatusCode } = action.configuration;

    const req = await fetch(targetUrl, {
      method: template.method,
      headers: template.headers,
      body: TemplateHelper.getTemplateBody(template, session.state.confirmedFields),
    });

    if (req.status !== expectedStatusCode) {
      await this.handleError({
        error: `Availability check failed with status ${req.status}. Expected ${expectedStatusCode}.`,
        alertMessage: `User attempted reservation but availability check failed with status ${req.status}. Please review the conversation and assist the user manually.`,
        generationContext: `Generate a message to inform the user that unfortunately the reservation cannot be completed due to unavailability. If there's a booking link, send It to the user so they can try to book by themselves. Apologize for the inconvenience.`,
        client,
        session,
        conversation,
        agent,
        targetId,
        credential,
        alert,
      });
      return;
    } else {
      this.logger.log(
        `Availability check succeeded with status ${req.status}. Proceeding to manage booking.`,
      );
      await this.agentService.updateAgentSession(session.sessionId, {
        state: {
          ...session.state,
          stage: 'manage_booking',
        },
      });

      await this.manageBooking({
        session,
        action: capture,
        conversation,
        alert,
        isInitial: true,
      });
    }
  }

  private verifyAndExtractActions({
    agent,
    actions,
  }: {
    agent: AgentEntity;
    actions: AgentActionEntity<AgentActionType>[];
  }): {
    alert: AgentActionEntity<'ALERT'>;
    captureData: AgentActionEntity<'CAPTURE_DATA'>;
    verifyExternal: AgentActionEntity<'VERIFY_EXTERNAL'>;
    reply: AgentActionEntity<'REPLY'>;
  } {
    if (!actions.length) {
      throw new Error(`No active actions found for agent ${agent.agentId}`);
    }

    const hasRequiredActions = this.requiredActionTypes.every((type) =>
      actions.some((action) => action.actionType === type),
    );
    if (!hasRequiredActions) {
      throw new Error(
        `Missing required actions for BookingManagerHandler. Required action types: ${this.requiredActionTypes.join(', ')}`,
      );
    }

    const alert = actions.find(
      (a) => a.actionType === AgentActionType.ALERT,
    ) as AgentActionEntity<'ALERT'>;
    const captureData = actions.find(
      (a) => a.actionType === AgentActionType.CAPTURE_DATA,
    ) as AgentActionEntity<'CAPTURE_DATA'>;
    const verifyExternal = actions.find(
      (a) => a.actionType === AgentActionType.VERIFY_EXTERNAL,
    ) as AgentActionEntity<'VERIFY_EXTERNAL'>;
    const reply = actions.find(
      (a) => a.actionType === AgentActionType.REPLY,
    ) as AgentActionEntity<'REPLY'>;

    return { alert, captureData, verifyExternal, reply };
  }

  private async getOrCreateSession(
    conversation: ConversationEntity,
    agent: AgentEntity,
  ): Promise<AgentSessionEntity | null> {
    if (conversation.activeAgentSessionId) {
      if (!conversation.session) {
        this.logger.error(
          `Conversation ${conversation.conversationId} has an activeAgentSessionId ${conversation.activeAgentSessionId} but session data is missing.`,
        );
        return null;
      }
      return conversation.session;
    }

    const session = await this.agentService.createAgentSession({
      conversationId: conversation.conversationId,
      agentId: agent.agentId,
      agentKey: agent.agentKey,
      state: this.initialSessionState,
    });

    await this.conversationService.updateConversationSession(
      conversation.conversationId,
      session.sessionId,
    );

    await this.conversationService.updateMessageSession(
      conversation?.messages?.[0].messageId ?? '',
      session.sessionId,
    );

    conversation.session = session;
    conversation.activeAgentSessionId = session.sessionId;

    this.logger.log(
      `Created new session ${session.sessionId} for conversation ${conversation.conversationId} and agent ${agent.agentId}`,
    );

    return session;
  }

  /**
   * Sends a message to the user and adds it to the conversation
   */
  private async sendAndLogMessage({
    message,
    conversation,
    agent,
    targetId,
    credential,
  }: {
    message: string;
    conversation: ConversationEntity;
    agent: AgentEntity;
    targetId: string;
    credential: ClientCredentialEntity;
  }): Promise<void> {
    const { platform, channel } = conversation;

    await this.replyAction.execute({
      message,
      platform,
      channel,
      target: targetId,
      credential,
    });

    await this.conversationService.addAgentMessage(conversation, agent.agentId, message);
  }

  private async handleError({
    error,
    alertMessage,
    alert,
    credential,
    session,
    conversation,
    generationContext,
    client,
    agent,
    targetId,
  }: {
    error: string;
    alertMessage: string;
    alert: AgentActionEntity<'ALERT'>;
    credential: ClientCredentialEntity;
    session: AgentSessionEntity;
    generationContext: string;
    conversation: ConversationEntity;
    client: ClientEntity;
    agent: AgentEntity;
    targetId: string;
  }) {
    this.logger.warn(error);

    await this.alertAction.execute({
      generatedMessage: alertMessage,
      alertChannel: alert.configuration.alertChannel,
      alertTarget: alert.configuration.alertTarget,
      clientContext: `Failed at: ${new Date().toISOString()}`,
    });

    const generatedFailedMessage = await this.generationService.generateResponseWithClientContext({
      client,
      configuration: agent.configuration,
      conversationHistory: conversation.messages,
      agentName: agent.name,
      promptOverride: generationContext,
    });

    await this.sendAndLogMessage({
      message: generatedFailedMessage,
      conversation,
      agent,
      targetId,
      credential,
    });

    await this.agentService.updateAgentSession(session.sessionId, {
      status: AgentSessionStatus.FAILED,
    });

    await this.conversationService.updateConversationSession(conversation.conversationId, null);
  }
}
