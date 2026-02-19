import { ConsoleLogger, Injectable } from '@nestjs/common';
import {
  AgentActionEntity,
  AgentEntity,
  AgentSessionEntity,
  ClientCredentialEntity,
  ClientEntity,
  ConversationEntity,
  ConversationMessageEntity,
} from 'src/types/entities';
import { AgentService } from '../Agent.service';
import { ConversationService } from 'src/messaging';
import { Utils } from '../../utils';
import { CaptureDataAction } from '../actions/CaptureData.action';
import { GenerationService } from '../../generation';
import { ReplyAction } from '../actions/Reply.action';
import { AgentActionType, AgentSessionStatus } from '../../generated/prisma/enums';
import { RetrievedField } from '../types';
import { AlertAction } from '../actions/Alert.action';

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
  ) {}
  // This is a placeholder for where you would implement integration with a CRM system.
  async handle({
    targetId,
    conversation,
    agent,
    client,
  }: {
    targetId: string;
    conversation: ConversationEntity;
    agent: AgentEntity;
    client: ClientEntity;
  }) {
    const validAgent = await this.agentService.getAgent(agent.agentId);
    const actions = await this.agentService.getActionsByAgentId(validAgent.agentId);

    // Validate all prerequisites
    if (!this.validateRequiredActions(actions)) return;

    const session = await this.getOrCreateSession(conversation, validAgent);
    if (!session) return;

    const credential = this.resolveCredential(conversation, client);
    if (!credential) return;

    const requiredActions = this.resolveRequiredActions(actions);

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

    this.logger.log(
      `Created new agent session ${session.sessionId} for conversation ${conversation.conversationId}`,
    );

    return session;
  }

  /**
   * Resolves the credential needed for the conversation's platform/channel
   */
  private resolveCredential(
    conversation: ConversationEntity,
    client: ClientEntity,
  ): ClientCredentialEntity | null {
    const requiredCredentialType = Utils.resolveRequiredCredential(
      conversation.platform,
      conversation.channel,
    );

    const credential = client.credentials?.find((cred) => cred.type === requiredCredentialType);

    if (!credential) {
      this.logger.error(
        `No credential of type ${requiredCredentialType} found for client ${client.clientId}`,
      );
      return null;
    }

    return credential;
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
  private async sendAndLogMessage(
    message: string,
    conversation: ConversationEntity,
    agent: AgentEntity,
    targetId: string,
    credential: ClientCredentialEntity,
    platform: any,
    channel: any,
  ): Promise<void> {
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
    const initialRequiredField = action.configuration.confirmationRequiredFields;
    const capturedFields = session.state.confirmedFields;

    if (!conversation.messages || conversation.messages.length === 0) {
      this.logger.warn(
        `No messages found for conversation ${conversation.conversationId} while handling confirm data action`,
      );
      return;
    }

    const missingStartFields = Utils.filterRequiredFields(initialRequiredField, capturedFields);
    const { retrieved, missing } = await this.captureDataAction.execute({
      requiredFields: missingStartFields,
      messages: conversation.messages,
    });

    if (missing.length > 0) {
      const generatedRequirement = await this.generationService.requestDataReply({
        client,
        conversationMessages: conversation.messages,
        requiredFields: missing,
        replyRules: agent.configuration.replyRules,
      });

      await this.sendAndLogMessage(
        generatedRequirement,
        conversation,
        agent,
        targetId,
        credential,
        conversation.platform,
        conversation.channel,
      );

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
        replyRules: agent.configuration.replyRules,
        conversationMessages: conversation.messages,
        requiredFields: initialRequiredFields,
        additionalContext: `This is the initial message for requesting this fields. Acknowledge the received information and request all the required fields`,
      });

      await this.sendAndLogMessage(
        requestMessage,
        conversation,
        agent,
        targetId,
        credential,
        conversation.platform,
        conversation.channel,
      );

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
        conversationMessages: conversation.messages,
        requiredFields: missing,
        replyRules: agent.configuration.replyRules,
      });

      await this.sendAndLogMessage(
        generatedRequirement,
        conversation,
        agent,
        targetId,
        credential,
        conversation.platform,
        conversation.channel,
      );

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

      await this.agentService.updateAgentSession(session.sessionId, {
        state: {
          ...session.state,
          stage: 'send_data',
          capturedFields: [...(session.state.capturedFields || []), ...retrieved],
        },
      });

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
      const mapping = fieldMappings.find((m) => m.key === field.key);
      const targetField = mapping ? mapping.targetKey : field.key;
      return {
        ...acc,
        [targetField]: field.value,
      };
    });

    const summary = await this.generationService.generateConversationSummary(messages);
    if (configuration.uniqueIdentifierField && configuration.uniqueIdentifier) {
      mappedFields[configuration.uniqueIdentifierField] = configuration.uniqueIdentifier;
    }

    const response = await fetch(urlTarget, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${configuration.authToken}`,
      },
      body: JSON.stringify({
        ...mappedFields,
        [configuration.summaryField]: `Conversation: ${conversation.conversationId}\n${summary}`,
      }),
    });

    if (!response.ok) {
      this.logger.error(
        `Failed to send data to CRM for conversation ${conversation.conversationId}. Status: ${response.status}, Response: ${await response.text()}`,
      );

      const generatedAlert = await this.generationService.generateAlertMessage(
        'Client contacted and started CRM flow, but failed to save data. Probably client is already there or the system is not available.',
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
        status: AgentSessionStatus.FAILED,
        state: {
          ...session.state,
          stage: 'complete',
        },
      });

      const generatedFailedReply = await this.generationService.generateResponseWithClientContext(
        client,
        agent.configuration.replyRules,
        conversation.messages,
        'You were attempting to save client information to CRM but was not able to do It. Apologize with the client and let them know that probably they already exist in the system and that the person in charge has been alerted to check the issue.',
      );

      await this.replyAction.execute({
        message: generatedFailedReply,
        platform: conversation.platform,
        channel: conversation.channel,
        target: targetId,
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
    const generatedReply = await this.generationService.generateResponseWithClientContext(
      client,
      agent.configuration.replyRules,
      conversation.messages,
      'You have just received several data fields from the client. Acknowledge the receipt of the information and let them know that the process is complete, and that someone will contact them soon regarding the next steps.',
    );

    await this.replyAction.execute({
      message: generatedReply,
      platform: conversation.platform,
      channel: conversation.channel,
      target: targetId,
      credential,
    });

    await this.conversationService.updateConversationSession(conversation.conversationId, null);
  }
}
