import { ConsoleLogger, Injectable } from '@nestjs/common';
import {
  AgentActionEntity,
  AgentEntity,
  ClientCredentialEntity,
  ClientEntity,
  ConversationEntity,
  ConversationMessageEntity,
} from 'src/types/entities';
import { AgentService } from '../Agent.service';
import { Utils } from 'src/utils';
import { AgentActionType, Platform } from 'src/generated/prisma/enums';
import { GenerationService } from 'src/generation';
import { ReplyAction } from '../actions/Reply.action';
import { AlertAction } from '../actions/Alert.action';
import { ConversationService } from 'src/messaging';

type CMHandlerContext = {
  client: ClientEntity;
  conversation: ConversationEntity;
  agent: AgentEntity;
  targetId: string;
  routingContext?: string;
};

@Injectable()
export class CommunityManagerHandler {
  constructor(
    private readonly logger: ConsoleLogger,
    private readonly agentService: AgentService,
    private readonly generationService: GenerationService,
    private readonly replyAction: ReplyAction,
    private readonly conversationService: ConversationService,
    private readonly alertAction: AlertAction,
  ) {}

  async handle({ client, conversation, agent, targetId, routingContext }: CMHandlerContext) {
    const agentData = await this.agentService.getAgent(agent.agentId);
    const actions = await this.agentService.getActionsByAgentId(agentData.agentId);

    const validActions = actions.filter((a) => a.isActive);
    if (!validActions.length) {
      this.logger.warn(`No active actions for agent ${agentData.agentId}`);
      return;
    }

    if (validActions.length === 1) {
      this.logger.log(
        `Single valid action ${validActions[0].actionId} for agent ${agentData.agentId}, executing directly`,
      );
      await this.handleActionExecution({
        action: validActions[0],
        client,
        conversation,
        agent: agentData,
        targetId,
      });
    }

    const actionDecision = await this.generationService.requestActionDecision(
      validActions,
      conversation.messages,
    );

    const chosenAction = validActions.find((a) => a.actionType === actionDecision.actionType);
    if (!chosenAction) {
      this.logger.error(
        `Model chose action type ${actionDecision.actionType} which is not in the list of valid actions for agent ${agentData.agentId}`,
      );
      return;
    }

    this.logger.debug(
      `Model decision: Action ${chosenAction.actionType} with score ${actionDecision.decisionScore}. Reason: ${actionDecision.reason}`,
    );

    Utils.mergeAgentConfigurations({
      agent,
      channel: conversation.channel,
      platform: conversation.platform,
      logger: this.logger,
    });

    await this.handleActionExecution({
      action: chosenAction,
      client,
      conversation,
      agent: agentData,
      targetId,
      reason: actionDecision.reason,
      actions,
      routingContext,
    });
  }

  private async handleActionExecution({
    action,
    conversation,
    client,
    reason,
    agent,
    targetId,
    actions,
    routingContext,
  }: CMHandlerContext & {
    reason?: string;
    action: AgentActionEntity;
    actions?: AgentActionEntity[];
  }) {
    const credential = client.credentials?.find(
      (c) =>
        c.type === Utils.resolveRequiredCredential(conversation.platform, conversation.channel),
    );
    if (!credential) {
      this.logger.error(
        `No credential found for client ${client.clientId} required for platform ${conversation.platform} and channel ${conversation.channel}`,
      );
      return;
    }

    switch (action.actionType) {
      case AgentActionType.REPLY:
        await this.handleReply({
          client,
          conversation,
          agent,
          targetId,
          credential,
          routingContext,
        });
        break;
      case AgentActionType.ALERT:
        await this.handleAlert({
          client,
          action,
          agent,
          reason,
          conversation,
          routingContext,
        });
        break;
      case AgentActionType.ESCALATE:
        await this.handleEscalate({ conversation, client, reason, actions, targetId, agent });
        break;
      default:
        this.logger.warn(`Unknown action type ${action.actionType} for action ${action.actionId}`);
    }
  }

  private async handleReply({
    agent,
    client,
    targetId,
    conversation,
    credential,
    routingContext,
  }: {
    client: ClientEntity;
    targetId: string;
    conversation: ConversationEntity;
    agent: AgentEntity;
    credential: ClientCredentialEntity;
    routingContext?: string;
  }) {
    const agentConfig = agent.configuration;

    const generatedResponse = await this.generationService.generateResponseWithClientContext({
      client,
      configuration: agentConfig,
      agentName: agent.name,
      conversationHistory: conversation.messages,
      promptOverride: routingContext
        ? `You have been routed from another agent with the following context: ${routingContext}.\nGiven the following conversation, and the context for routing, provide the client an appropiate response:`
        : undefined,
    });

    await this.replyAction.execute({
      message: generatedResponse,
      platform: conversation.platform,
      channel: conversation.channel,
      target: targetId,
      credential,
    });

    await this.conversationService.addAgentMessage(conversation, agent.agentId, generatedResponse);
  }

  private async handleAlert({
    agent,
    client,
    action,
    reason,
    conversation,
    actions,
    routingContext,
  }: {
    agent: AgentEntity;
    client: ClientEntity;
    conversation: ConversationEntity;
    reason?: string;
    action: AgentActionEntity;
    actions?: AgentActionEntity[];
    routingContext?: string;
  }) {
    try {
      if (!reason || !actions) throw new Error('Reason and actions is required for alert actions');
      const actionConfig = action.configuration;

      const replyAction = actions.find((a) => a.actionType === AgentActionType.REPLY);
      if (!replyAction) {
        this.logger.warn(
          `No reply action found for agent ${action.agentId} to execute after alert action ${action.actionId}`,
        );
        return;
      }
      const replyCreds = client.credentials?.find(
        (c) =>
          c.type === Utils.resolveRequiredCredential(conversation.platform, conversation.channel),
      );
      if (!replyCreds) {
        this.logger.warn(
          `No credentials found for client ${client.clientId} to execute reply action after alert action ${action.actionId}`,
        );
        return;
      }

      const generatedAlert = await this.generationService.generateAlertMessage(
        reason,
        agent.configuration.modelTier,
        conversation.messages,
      );

      const clientContext =
        conversation.platform === Platform.WHATSAPP
          ? `Number: ${conversation.senderId}`
          : (conversation.senderUsername ?? `A client from ${client.businessName}`);

      await this.alertAction.execute({
        clientContext: clientContext,
        generatedMessage: generatedAlert,
        alertTarget: actionConfig.alertTarget,
        alertChannel: actionConfig.alertChannel,
      });

      await this.handleReply({
        agent,
        client,
        credential: replyCreds,
        conversation,
        targetId: conversation.senderId,
        routingContext,
      });
    } catch (e) {
      this.logger.error(
        `Unable to execute alert action ${action.actionId} for conversation ${conversation.conversationId}: ${(e as Error).message}`,
      );
    }
  }

  // TODO This can be enhanced to handle severity values and have a predefined process/reply for each severity level -> Each severity level has a pause value
  private async handleEscalate({
    conversation,
    client,
    reason,
    agent,
    actions,
    targetId,
  }: {
    conversation: ConversationEntity;
    client: ClientEntity;
    agent: AgentEntity;
    targetId: string;
    reason?: string;
    actions?: AgentActionEntity[];
  }) {
    try {
      if (!reason || !actions)
        throw new Error('Reason and actions are required for escalate actions');
      const clientContext =
        conversation.platform === Platform.WHATSAPP
          ? `Number: ${conversation.senderId}`
          : (conversation.senderUsername ?? `A client from ${client.businessName}`);

      const alertAction = actions.find((a) => a.actionType === AgentActionType.ALERT);
      if (alertAction) {
        await this.conversationService.pauseConversation(conversation.conversationId);

        await this.alertAction.execute({
          clientContext: clientContext,
          generatedMessage: `Conversation escalated by agent.\n${reason}\nConversation will be paused for 12 hours.`,
          alertTarget: alertAction.configuration.alertTarget,
          alertChannel: alertAction.configuration.alertChannel,
        });

        const replyAction = actions.find((a) => a.actionType === AgentActionType.REPLY);
        const replyCredential = client.credentials?.find(
          (c) =>
            c.type === Utils.resolveRequiredCredential(conversation.platform, conversation.channel),
        );
        if (!replyAction || !replyCredential) {
          this.logger.warn(
            `No reply action or credentials found for client ${client.clientId} to execute after escalate action in conversation ${conversation.conversationId}`,
          );
          return;
        }

        const generatedReply = await this.generationService.generateEscalationMessage(
          reason,
          agent.configuration.modelTier,
          conversation.messages,
        );

        await this.replyAction.execute({
          message: generatedReply,
          platform: conversation.platform,
          channel: conversation.channel,
          target: targetId,
          credential: replyCredential,
        });
      } else {
        this.logger.warn(
          `Escalation process cannot be triggered without an alert action configured for the agent`,
        );
      }
    } catch (e) {
      this.logger.error(
        `Unable to execute escalate action for conversation ${conversation.conversationId}: ${(e as Error).message}`,
      );
    }
  }
}
