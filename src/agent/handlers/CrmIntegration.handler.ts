import { ConsoleLogger, Injectable } from '@nestjs/common';
import {
  AgentActionEntity,
  AgentEntity,
  AgentSessionEntity,
  ClientEntity,
  ConversationEntity,
  ConversationMessageEntity,
  ClientCredentialEntity,
} from 'src/types/entities';
import { AgentService } from '../Agent.service';
import { ConversationService } from 'src/messaging';
import { Utils } from '../../utils';
import { CaptureDataAction } from '../actions/CaptureData.action';
import { GenerationService } from '../../generation';
import { ReplyAction } from '../actions/Reply.action';
import { AgentActionType, AgentKey, AgentSessionStatus } from '../../generated/prisma/enums';
import { RetrievedField } from '../types';
import { AlertAction } from '../actions/Alert.action';
import { CommunityManagerHandler } from './CommunityManager.handler';

interface CrmSessionState {
  stage: 'confirm_data' | 'capture_data' | 'send_data' | 'complete';
  confirmedFields: RetrievedField[];
  capturedFields: RetrievedField[];
}

interface RequiredActions {
  fieldExtractor: AgentActionEntity;
  notificationService: AgentActionEntity;
  crmSubmitter: AgentActionEntity;
}

@Injectable()
export class CrmIntegrationHandler {
  readonly requiredActions: AgentActionType[] = [
    AgentActionType.ALERT,
    AgentActionType.EXECUTE_EXTERNAL,
    AgentActionType.CAPTURE_DATA,
    AgentActionType.REPLY,
  ];

  private readonly initialSessionState: CrmSessionState = {
    stage: 'confirm_data',
    confirmedFields: [],
    capturedFields: [],
  };

  constructor(
    private readonly logger: ConsoleLogger,
    private readonly agentService: AgentService,
    private readonly generationService: GenerationService,
    private readonly conversationService: ConversationService,
    private readonly captureDataAction: CaptureDataAction,
    private readonly replyAction: ReplyAction,
    private readonly alertAction: AlertAction,
    private readonly CMAgentHandler: CommunityManagerHandler,
  ) {}
  // This is a placeholder for where you would implement integration with a CRM system.
  async handle({
    targetId,
    conversation,
    agent,
    client,
    credential,
  }: {
    targetId: string;
    conversation: ConversationEntity;
    agent: AgentEntity;
    client: ClientEntity;
    credential: ClientCredentialEntity;
  }) {
    const validAgent = await this.agentService.getAgent(agent.agentId);
    const actions = await this.agentService.getActionsByAgentId(validAgent.agentId);

    Utils.mergeAgentConfigurations({
      agent: validAgent,
      channel: conversation.channel,
      platform: conversation.platform,
      logger: this.logger,
    });

    // Validate all prerequisites
    if (!this.validateRequiredActions(actions)) return;
    const requiredActions = this.resolveRequiredActions(actions);

    const { existingSession, messages } = await this.agentService.verifySessionExistence(
      conversation.conversationId,
      validAgent.agentId,
    );

    if (existingSession) {
      if (
        existingSession.status === AgentSessionStatus.COMPLETED ||
        existingSession.status === AgentSessionStatus.FAILED
      ) {
        this.logger.log(
          `Existing completed session found for conversation ${conversation.conversationId}. Handling accordingly.`,
        );
        await this.handleExistingSession({
          client,
          targetId,
          agent: validAgent,
          conversation,
          messages,
          notificationService: requiredActions.notificationService,
          credential,
        });

        await this.agentService.updateAgentSession(existingSession.sessionId, {
          status: AgentSessionStatus.REALERTED,
        });
        return;
      } else if (existingSession.status === AgentSessionStatus.REALERTED) {
        this.logger.log(
          `Existing session already realerted for conversation ${conversation.conversationId}. Routed to CM Agent`,
        );

        const cmAgent = await this.agentService.getAgentByKey(
          client.clientId,
          AgentKey.COMMUNITY_MANAGER,
        );
        await this.CMAgentHandler.handle({
          targetId,
          conversation,
          credential,
          agent: cmAgent,
          client,
          routingContext: `Client has returned again to the CRM flow after having a completed session and the team being realerted. Data can't be captured again and someone will contact the user soon.`,
        });
        return;
      }
    }

    const session = await this.getOrCreateSession(conversation, validAgent);
    if (!session) return;

    switch (session.state.stage) {
      case 'confirm_data':
        await this.handleConfirmData({
          client,
          agent: validAgent,
          targetId,
          action: requiredActions.fieldExtractor,
          credential,
          conversation,
          session,
        });
        break;
      case 'capture_data':
        await this.handleCaptureData({
          action: requiredActions.fieldExtractor,
          client,
          notificationService: requiredActions.notificationService,
          crmSubmitter: requiredActions.crmSubmitter,
          targetId,
          credential,
          session,
          conversation,
          agent: validAgent,
        });
        break;
      case 'send_data':
        // This should not happen in normal flow - handleCaptureData calls handleSaveData directly
        this.logger.warn(
          `Conversation ${conversation.conversationId} in send_data stage but no message to process. Session may be stuck.`,
        );
        return;
      default:
        this.logger.warn(`Unknown stage '${session.state.stage}' for session ${session.sessionId}`);
        return;
    }
  }

  /**
   * Validates that all required agent actions exist
   */
  private validateRequiredActions(actions: AgentActionEntity[]): boolean {
    const allRequiredActionsPresent = this.requiredActions.every((required) =>
      actions.some((a) => a.actionType === required),
    );

    if (!allRequiredActionsPresent) {
      this.logger.warn(
        `CRM Agent missing required actions. Required: ${this.requiredActions.join(', ')}. Found: ${actions.map((a) => a.actionType).join(', ')}. Skipping`,
      );
      return false;
    }
    return true;
  }

  /**
   * Gets existing session or creates new one if conversation is not yet bound
   */
  private async getOrCreateSession(
    conversation: ConversationEntity,
    agent: AgentEntity,
  ): Promise<AgentSessionEntity | null> {
    if (conversation.activeAgentSessionId) {
      if (!conversation.session) {
        this.logger.error(
          `Conversation ${conversation.conversationId} has activeAgentSessionId but no session data`,
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

    // Updates last user message to be related to the session, so that it can be retrieved in the context of the session
    await this.conversationService.updateMessageSession(
      conversation?.messages?.[0].messageId ?? '',
      session.sessionId,
    );

    // Update the in-memory conversation object to reflect the session binding
    conversation.session = session;
    conversation.activeAgentSessionId = session.sessionId;

    this.logger.log(
      `Created new agent session ${session.sessionId} for conversation ${conversation.conversationId}`,
    );

    return session;
  }

  /**
   * Resolves all required agent actions from the actions list
   */
  private resolveRequiredActions(actions: AgentActionEntity[]): RequiredActions {
    return {
      fieldExtractor: actions.find((a) => a.actionType === AgentActionType.CAPTURE_DATA)!,
      notificationService: actions.find((a) => a.actionType === AgentActionType.ALERT)!,
      crmSubmitter: actions.find((a) => a.actionType === AgentActionType.EXECUTE_EXTERNAL)!,
    };
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

  private async handleConfirmData({
    client,
    agent,
    targetId,
    action,
    credential,
    conversation,
    session,
  }: {
    agent: AgentEntity;
    client: ClientEntity;
    targetId: string;
    credential: ClientCredentialEntity;
    action: AgentActionEntity;
    conversation: ConversationEntity;
    session: AgentSessionEntity;
  }): Promise<void> {
    const confirmContext = action.configuration.confirmationContext;
    const initialRequiredField = action.configuration.confirmationRequiredFields;
    const capturedFields = session.state.confirmedFields;

    if (!conversation.messages || conversation.messages.length === 0) {
      this.logger.warn(
        `No messages found for conversation ${conversation.conversationId} while handling confirm data action`,
      );
      return;
    }

    const missingStartFields = Utils.filterRequiredFields(initialRequiredField, capturedFields);
    if (session.status === AgentSessionStatus.STARTED) {
      const requestMessage = await this.generationService.requestDataReply({
        client,
        configuration: agent.configuration,
        agentName: agent.name,
        conversationMessages: conversation.messages,
        requiredFields: missingStartFields,
        additionalContext: `This is the initial message for confirming required fields. This means the client was just redirected to the CRM capture flow`,
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
    const { retrieved, missing } = await this.captureDataAction.execute({
      requiredFields: missingStartFields,
      extractionContext: confirmContext,
      messages: conversation.messages,
    });

    if (missing.length > 0) {
      const generatedRequirement = await this.generationService.requestDataReply({
        client,
        conversationMessages: conversation.messages,
        requiredFields: missing,
        configuration: agent.configuration,
        agentName: agent.name,
      });

      await this.sendAndLogMessage({
        message: generatedRequirement,
        conversation,
        agent,
        targetId,
        credential,
      });

      const newState = {
        ...session.state,
        confirmedFields: [...(session.state.confirmedFields || []), ...retrieved],
      };

      await this.agentService.updateAgentSession(session.sessionId, { state: newState });
    } else {
      this.logger.log(`All confirmation fields captured. Transitioning to capture_data stage.`);
      await this.agentService.updateAgentSession(session.sessionId, {
        state: {
          ...session.state,
          stage: 'capture_data',
          confirmedFields: [...(session.state.confirmedFields || []), ...retrieved],
        },
      });

      // Immediately send initial message for capture_data stage to inform user of next steps
      await this.handleCaptureData({
        action,
        client,
        targetId,
        credential,
        session,
        conversation,
        agent,
        isInitial: true,
      });
    }
  }

  private async handleCaptureData({
    action,
    client,
    targetId,
    agent,
    session,
    notificationService,
    crmSubmitter,
    conversation,
    credential,
    isInitial = false,
  }: {
    action: AgentActionEntity;
    session: AgentSessionEntity;
    targetId: string;
    notificationService?: AgentActionEntity;
    crmSubmitter?: AgentActionEntity;
    agent: AgentEntity;
    client: ClientEntity;
    credential: ClientCredentialEntity;
    conversation: ConversationEntity;
    isInitial?: boolean;
  }): Promise<void> {
    const initialRequiredFields = action.configuration.captureRequiredFields;
    const capturedFields = session.state.capturedFields;

    if (!conversation.messages || conversation.messages.length === 0) {
      this.logger.warn(
        `No messages found for conversation ${conversation.conversationId} while handling capture data action`,
      );
      return;
    }

    if (isInitial) {
      const requestMessage = await this.generationService.requestDataReply({
        client,
        configuration: agent.configuration,
        conversationMessages: conversation.messages,
        agentName: agent.name,
        requiredFields: initialRequiredFields,
        additionalContext: `This is the initial message for requesting this fields. Acknowledge the received information and request all the required fields`,
      });

      await this.sendAndLogMessage({
        message: requestMessage,
        conversation,
        agent,
        targetId,
        credential,
      });

      this.logger.log(`Started capture data step. Initial request sent`);
      return;
    }

    const missingStartFields = Utils.filterRequiredFields(initialRequiredFields, capturedFields);
    const { retrieved, missing } = await this.captureDataAction.execute({
      requiredFields: missingStartFields,
      messages: conversation.messages,
    });

    if (missing.length > 0) {
      const generatedRequirement = await this.generationService.requestDataReply({
        client,
        configuration: agent.configuration,
        conversationMessages: conversation.messages,
        requiredFields: missing,
        agentName: agent.name,
      });

      await this.sendAndLogMessage({
        message: generatedRequirement,
        conversation,
        agent,
        targetId,
        credential,
      });

      const newState = {
        ...session.state,
        capturedFields: [...(session.state.capturedFields || []), ...retrieved],
      };

      await this.agentService.updateAgentSession(session.sessionId, { state: newState });
    } else {
      this.logger.log(`All fields captured for capture data step! Updating session`);

      if (!notificationService || !crmSubmitter) {
        this.logger.error(
          `Missing required actions for CRM integration to proceed with sending data. NotificationService: ${notificationService ? 'Found' : 'Not Found'}, CrmSubmitter: ${crmSubmitter ? 'Found' : 'Not Found'}`,
        );
        return;
      }

      const updatedCapturedFields = [...(session.state.capturedFields || []), ...retrieved];

      await this.agentService.updateAgentSession(session.sessionId, {
        state: {
          ...session.state,
          stage: 'send_data',
          capturedFields: updatedCapturedFields,
        },
      });

      session.state.capturedFields = updatedCapturedFields;
      session.state.stage = 'send_data';

      await this.handleSaveData({
        session,
        conversation,
        action: crmSubmitter,
        agent,
        credential,
        client,
        targetId,
        notificationService,
        messages: conversation.messages,
      });
    }
  }

  private async handleSaveData({
    session,
    conversation,
    action,
    agent,
    credential,
    client,
    targetId,
    notificationService,
    messages,
  }: {
    conversation: ConversationEntity;
    action: AgentActionEntity;
    client: ClientEntity;
    credential: ClientCredentialEntity;
    targetId: string;
    agent: AgentEntity;
    session: AgentSessionEntity;
    notificationService: AgentActionEntity;
    messages: ConversationMessageEntity[];
  }) {
    const configuration = action.configuration;
    const urlTarget = configuration.url;
    const capturedFields: RetrievedField[] = session.state.capturedFields;
    const fieldMappings = configuration.fieldMappings;

    const mappedFields = capturedFields.reduce((acc, field) => {
      const mapping = fieldMappings.find((m) => m.sourceField === field.key);
      const targetField = mapping ? mapping.targetField : field.key;
      return {
        ...acc,
        [targetField]: field.value,
      };
    }, {});

    const summary = await this.generationService.generateConversationSummary(messages);
    if (configuration.uniqueIdentifierField && configuration.uniqueIdentifier) {
      mappedFields[configuration.uniqueIdentifierField] = configuration.uniqueIdentifier;
    }

    const response = await fetch(urlTarget, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `${configuration.authHeader}`,
      },
      body: JSON.stringify({
        ...mappedFields,
        [configuration.summaryField]: `Conversation: ${conversation.conversationId}\n${summary}`,
      }),
    });

    if (!response.ok) {
      const result = await response.text();
      this.logger.error(
        `Failed to send data to CRM for conversation ${conversation.conversationId}. Status: ${response.status}, Response: ${result}`,
      );

      const generatedAlert = await this.generationService.generateAlertMessage(
        'Client contacted and started CRM flow, but failed to save data. Probably client is already there or the system is not available.',
        agent.configuration.modelTier,
        messages,
      );

      const clientContext = await this.generationService.simpleGenerate(
        `Give me a summary of client context based on the following given fields: ${JSON.stringify(mappedFields)}`,
      );

      await this.alertAction.execute({
        generatedMessage: `${generatedAlert}\n\nSummary of the conversation:\n${summary}`,
        alertTarget: notificationService.configuration.alertTarget,
        alertChannel: notificationService.configuration.alertChannel,
        clientContext,
      });

      await this.conversationService.updateConversationSession(conversation.conversationId, null);
      await this.agentService.updateAgentSession(session.sessionId, {
        summary,
        status: AgentSessionStatus.FAILED,
        endedAt: new Date(),
        result,
        state: {
          ...session.state,
          stage: 'complete',
        },
      });

      // TODO IMPLEMENT ALERT ON SUCCESS TOO :)
      const generatedFailedReply = await this.generationService.generateResponseWithClientContext({
        client,
        configuration: agent.configuration,
        agentName: agent.name,
        conversationHistory: conversation.messages,
        promptOverride:
          'You were attempting to save client information to CRM but was not able to do It. Reply to the customer apologizing for the inconvenience and let them know that probably they already exist in the system and that the person in charge has been alerted to check the issue.',
      });

      await this.sendAndLogMessage({
        message: generatedFailedReply,
        conversation,
        agent,
        targetId,
        credential,
      });

      return;
    }

    const result = await response.json();
    this.logger.log(
      `Successfully sent data to CRM for conversation ${conversation.conversationId}`,
    );
    await this.agentService.updateAgentSession(session.sessionId, {
      status: AgentSessionStatus.COMPLETED,
      summary,
      endedAt: new Date(),
      state: {
        ...session.state,
        stage: 'complete',
      },
      result,
    });

    await this.handleComplete({
      targetId,
      conversation,
      agent,
      credential,
      client,
    });
  }

  private async handleComplete({
    targetId,
    conversation,
    agent,
    credential,
    client,
  }: {
    targetId: string;
    conversation: ConversationEntity;
    agent: AgentEntity;
    credential: ClientCredentialEntity;
    client: ClientEntity;
  }) {
    const generatedReply = await this.generationService.generateResponseWithClientContext({
      client,
      configuration: agent.configuration,
      agentName: agent.name,
      conversationHistory: conversation.messages,
      promptOverride:
        'You have just received several data fields from the client. Create a reply acknowledging the receipt of the information and let them know that the process is complete, and that someone will contact them soon regarding the next steps.',
    });

    await this.sendAndLogMessage({
      message: generatedReply,
      conversation,
      agent,
      targetId,
      credential,
    });

    await this.conversationService.updateConversationSession(conversation.conversationId, null);
  }

  async handleExistingSession({
    client,
    targetId,
    agent,
    conversation,
    messages,
    notificationService,
    credential,
  }: {
    messages: ConversationMessageEntity[];
    conversation: ConversationEntity;
    targetId: string;
    client: ClientEntity;
    credential: ClientCredentialEntity;
    notificationService: AgentActionEntity;
    agent: AgentEntity;
  }): Promise<void> {
    const generatedReply = await this.generationService.generateResponseWithClientContext({
      client,
      configuration: agent.configuration,
      agentName: agent.name,
      conversationHistory: messages,
      promptOverride:
        'The client has returned to the CRM flow but there is already a session completed. With the conversation history context for that session, reply letting the customer know that their information has already been received and that the right team has been alerted again and user be contacted soon regarding the next steps.',
    });

    await this.sendAndLogMessage({
      message: generatedReply,
      conversation,
      credential,
      agent,
      targetId,
    });

    const alertMessage = await this.generationService.generateAlertMessage(
      'Client has returned to the CRM flow but there is already a session completed. Alerting the team again with the conversation history context for that session, so they can check the case again and contact the client if needed.',
      agent.configuration.modelTier,
      messages,
    );

    await this.alertAction.execute({
      generatedMessage: alertMessage,
      alertTarget: notificationService.configuration.alertTarget,
      alertChannel: notificationService.configuration.alertChannel,
      clientContext: `Message received at: ${new Date().toISOString()}, for platform: ${conversation.platform}, channel: ${conversation.channel}`,
    });
  }
}
