import { ConsoleLogger, Injectable } from '@nestjs/common';
import {
  AgentActionEntity,
  AgentEntity,
  ClientCredentialEntity,
  ClientEntity,
  ConversationEntity,
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

  async handle({ client, conversation, agent, targetId }: CMHandlerContext) {
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

    await this.handleActionExecution({
      action: chosenAction,
      client,
      conversation,
      agent: agentData,
      targetId,
      reason: actionDecision.reason,
      actions,
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
  }: CMHandlerContext & {
    reason?: string;
    action: AgentActionEntity;
    actions?: AgentActionEntity[];
  }) {
    const variants = agent.variants || [];
    if (variants.length) {
      const matchVariant = variants.find(
        (v) =>
          (v.platform === null || v.platform === conversation.platform) &&
          (v.channel === null || v.channel === conversation.channel),
      );

      if (matchVariant && matchVariant.isActive) {
        this.logger.log(
          `Found matching variant ${matchVariant.variantId} for action ${action.actionId}`,
        );
        // In case variant overrides any of the agent configurations
        if (matchVariant.overrideConfiguration)
          agent.configuration = Utils.mergeConfigurationOverrides(
            agent.configuration,
            matchVariant.overrideConfiguration,
          );
      }
    }

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
        });
        break;
      case AgentActionType.ALERT:
        await this.handleAlert({
          client,
          action,
          agent,
          reason,
          conversation,
        });
        break;
      case AgentActionType.ESCALATE:
        await this.handleEscalate({ conversation, client, reason, actions, targetId });
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
  }: {
    client: ClientEntity;
    targetId: string;
    conversation: ConversationEntity;
    agent: AgentEntity;
    credential: ClientCredentialEntity;
  }) {
    const agentConfig = agent.configuration;

    const generatedResponse = await this.generationService.generateResponseWithClientContext(
      client,
      agentConfig.replyRules,
      conversation.messages,
    );

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
  }: {
    agent: AgentEntity;
    client: ClientEntity;
    conversation: ConversationEntity;
    reason?: string;
    action: AgentActionEntity;
    actions?: AgentActionEntity[];
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
    actions,
    targetId,
  }: {
    conversation: ConversationEntity;
    client: ClientEntity;
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
