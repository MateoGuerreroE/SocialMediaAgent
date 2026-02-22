import { ConsoleLogger, Injectable } from '@nestjs/common';
import {
  AgentActionEntity,
  AgentEntity,
  ClientEntity,
  ConversationEntity,
  PlatformCredentialEntity,
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
  credential: PlatformCredentialEntity;
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

  async handle({
    client,
    conversation,
    agent,
    targetId,
    credential,
    routingContext,
  }: CMHandlerContext) {
    const agentData = await this.agentService.getAgent(agent.agentId);
    const actions = await this.agentService.getActionsByAgentId(agentData.agentId);

    this.logger.debug(`Agent Data: ${JSON.stringify(agentData, null, 2)}`);
    this.logger.debug(`Agent Actions: ${JSON.stringify(actions, null, 2)}`);

    const validActions = actions.filter((a) => a.isActive);
    if (!validActions.length) {
      this.logger.warn(`No active actions for agent ${agentData.agentId}`);
      return;
    }

    Utils.mergeAgentConfigurations({
      agent: agentData,
      channel: conversation.channel,
      platform: conversation.platform,
      logger: this.logger,
    });

    if (validActions.length === 1) {
      this.logger.log(
        `Single valid action ${validActions[0].actionId} for agent ${agentData.agentId}, executing directly`,
      );
      await this.handleActionExecution({
        credential,
        action: validActions[0],
        client,
        conversation,
        agent: agentData,
        targetId,
      });
      return;
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

    await this.handleActionExecution({
      action: chosenAction,
      client,
      conversation,
      agent: agentData,
      targetId,
      credential,
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
    credential,
    actions,
    routingContext,
  }: CMHandlerContext & {
    reason?: string;
    action: AgentActionEntity;
    actions?: AgentActionEntity[];
  }) {
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
          credential,
          reason,
          conversation,
          routingContext,
        });
        break;
      case AgentActionType.ESCALATE:
        await this.handleEscalate({
          conversation,
          client,
          reason,
          actions,
          targetId,
          agent,
          credential,
        });
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
    credential: PlatformCredentialEntity;
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
    credential,
    conversation,
    actions,
    routingContext,
  }: {
    agent: AgentEntity;
    client: ClientEntity;
    conversation: ConversationEntity;
    reason?: string;
    credential: PlatformCredentialEntity;
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
        credential,
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
    credential,
    actions,
    targetId,
  }: {
    conversation: ConversationEntity;
    client: ClientEntity;
    agent: AgentEntity;
    targetId: string;
    reason?: string;
    credential: PlatformCredentialEntity;
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
          credential,
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
