import { ConsoleLogger, Injectable } from '@nestjs/common';
import { SocialMediaEvent } from '../types/messages';
import { ClientService } from '../client';
import { ConversationService } from '../messaging/Conversation.service';
import { AgentEntity, ClientEntity, ConversationEntity } from '../types/entities';
import { CredentialType, Platform, PlatformChannel } from '../generated/prisma/enums';
import { GenerativeService } from '../generation';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { MessageWindowService } from '../messaging/MessageWindow.service';
import { EarlyTerminationError } from '../types/errors/EarlyTerminationError';
import { Utils } from '../utils';
import { AgentLogRepository } from 'src/data/repository';

@Injectable()
export class OrchestrationService {
  constructor(
    private readonly logger: ConsoleLogger,
    private readonly clientService: ClientService,
    private readonly conversationService: ConversationService,
    private readonly generationService: GenerativeService,
    private readonly messageWindowService: MessageWindowService,
    private readonly agentLogRepository: AgentLogRepository,
    @InjectQueue('agent-community-manager') private readonly agentCommunityManagerQueue: Queue,
    @InjectQueue('agent-crm-integration') private readonly agentCrmIntegrationQueue: Queue,
    @InjectQueue('agent-booking-manager') private readonly agentBookingManagerQueue: Queue,
  ) {}

  async orchestrateEvent(event: SocialMediaEvent): Promise<void> {
    this.logger.debug(`Orchestrating event: ${JSON.stringify(event, null, 2)}`);
    try {
      if (event.eventType === 'deleted') {
        await this.conversationService.deleteMessage(event.metadata.externalId);
        return;
      }

      if (event.eventType === 'updated') {
        this.logger.warn(`UPDATE case received. This is not implemented yet`);
        return;
      }

      const client = await this.clientService.getClientBySocialAccount({
        accountId: event.accountId,
        platform: event.platform,
      });

      const canClientProcess = this.verifyClient(client, event.platform, event.channel);
      if (!canClientProcess) return;

      const conversation = await this.conversationService.getOrCreateConversation(
        event,
        client.clientId,
      );

      const canConversationProcess = this.verifyConversation(conversation);
      if (!canConversationProcess) return;

      if (event.channel === PlatformChannel.DIRECT_MESSAGE) {
        await this.bufferDMMessageForConversation(conversation, event);
      }

      await this.conversationService.addUserMessage(conversation, event);

      const { selectedAgent, logId } = await this.requireAgentDecision({
        agents: client.agents!,
        conversation,
        message: event.content.text,
        messageId: event.messageId,
      });

      await this.routeToQueue({
        agentKey: selectedAgent.agentKey,
        conversation,
        client,
        event,
        logId,
      });
    } catch (e) {
      if (e instanceof EarlyTerminationError) {
        this.logger.warn(`Early termination: ${e.message}`);
        return;
      }
      this.logger.error(`Error orchestrating event: ${e.message}`);
    }
  }

  private async routeToQueue({
    agentKey,
    conversation,
    client,
    event,
    logId,
  }: {
    agentKey: string;
    conversation: ConversationEntity;
    client: ClientEntity;
    event: SocialMediaEvent;
    logId?: string;
  }) {
    const payload = {
      conversation,
      client,
      event,
      logId,
    };

    switch (agentKey) {
      case 'COMMUNITY_MANAGER':
        await this.agentCommunityManagerQueue.add('handleEvent', payload, {
          jobId: event.messageId,
        });
        break;
      case 'CRM_INTEGRATION':
        await this.agentCrmIntegrationQueue.add('handleEvent', payload, {
          jobId: event.messageId,
        });
        break;
      case 'BOOKING_MANAGER':
        await this.agentBookingManagerQueue.add('handleEvent', payload, {
          jobId: event.messageId,
        });
        break;
    }
  }

  async requireAgentDecision({
    agents,
    conversation,
    message,
    messageId,
  }: {
    agents: AgentEntity[];
    conversation: ConversationEntity;
    message: string;
    messageId: string;
  }): Promise<{
    selectedAgent: AgentEntity;
    logId?: string;
  }> {
    if (conversation.session) {
      const sessionAgent = agents.find(
        (agent) => agent.agentKey === conversation.session!.agentKey,
      );
      if (sessionAgent && sessionAgent.isActive) {
        this.logger.debug(
          `Existing session found for conversation ${conversation.conversationId}. Automatically selecting agent ${sessionAgent.agentKey}.`,
        );
        return { selectedAgent: sessionAgent };
      }
    }
    const activeAgents = agents.filter((agent) => agent.isActive);
    if (activeAgents.length === 1) {
      this.logger.log(
        `Only one agent available (${activeAgents[0].agentKey}). Automatically selecting this agent.`,
      );
      return { selectedAgent: activeAgents[0] };
    }

    const decision = await this.generationService.requestAgentDecision(activeAgents, message);

    const selectedAgent = activeAgents.find((agent) => agent.agentKey === decision.agent);
    if (!selectedAgent) {
      this.logger.warn(
        `Model returned an invalid agent key: ${decision.agent}. Defaulting to first agent in the list.`,
      );
      return { selectedAgent: activeAgents[0] };
    }

    const logId = await this.agentLogRepository.createLog({
      logId: Utils.generateUUID(),
      agentId: selectedAgent.agentId,
      messageId,
      decisionScore: decision.decisionScore,
      reason: decision.reason,
      conversationId: conversation.conversationId,
      message,
      metadata: {},
    });

    this.logger.debug(
      `Model decision: Agent ${selectedAgent.agentKey} with score ${decision.decisionScore}. Reason: ${decision.reason}`,
    );

    return { selectedAgent, logId };
  }

  verifyClient(client: ClientEntity, platform: Platform, channel: PlatformChannel): boolean {
    const { businessName, isActive, credentials = [] } = client;

    if (!isActive) {
      this.logger.warn(`Client ${businessName} is inactive. Skipping event processing.`);
      return false;
    }

    // Check platform-specific account IDs
    const platformAccountMap = {
      [Platform.WHATSAPP]: client.whatsappNumber,
      [Platform.INSTAGRAM]: client.instagramAccountId,
      [Platform.FACEBOOK]: client.facebookAccountId,
    };

    if (!platformAccountMap[platform]) {
      this.logger.warn(
        `Client ${businessName} does not have a ${platform} account configured. Skipping event processing.`,
      );
      return false;
    }

    // Check credentials exist
    if (credentials.length === 0) {
      this.logger.warn(
        `Client ${businessName} does not have any credentials configured. Skipping event processing.`,
      );
      return false;
    }

    // Define required credentials based on platform/channel
    const requiredCredentials: CredentialType[] = [];

    if (platform === Platform.INSTAGRAM && channel === PlatformChannel.DIRECT_MESSAGE) {
      requiredCredentials.push(CredentialType.APP_ACCESS_TOKEN);
    } else {
      if (platform === Platform.WHATSAPP) {
        requiredCredentials.push(CredentialType.WHATSAPP_S3_BUCKET);
      } else {
        requiredCredentials.push(CredentialType.PAGE_ACCESS_TOKEN);
      }
    }

    // Check all required credentials in one pass
    for (const requiredType of requiredCredentials) {
      const credential = credentials.find((cred) => cred.type === requiredType);
      if (!credential || (credential.expiresAt && credential.expiresAt < new Date())) {
        this.logger.warn(
          `Client ${businessName} does not have a valid ${requiredType} configured or it is expired. Skipping event processing.`,
        );
        return false;
      }
    }

    if (!client.agents || client.agents.length === 0) {
      this.logger.warn(
        `Client ${businessName} does not have any agents configured. Skipping event processing.`,
      );
      return false;
    }

    if (!client.agents.some((agent) => agent.isActive)) {
      this.logger.warn(
        `Client ${businessName} does not have any active agents. Skipping event processing.`,
      );
      return false;
    }

    return true;
  }

  verifyConversation(conversation: ConversationEntity): boolean {
    if (conversation.pausedUntil && conversation.pausedUntil > new Date()) {
      this.logger.warn(
        `Conversation ${conversation.conversationId} is paused until ${conversation.pausedUntil.toDateString()}. Skipping event processing.`,
      );
      return false;
    }

    return true;
  }

  private async bufferDMMessageForConversation(
    conversation: ConversationEntity,
    event: SocialMediaEvent,
  ) {
    const { conversationId, activeAgentSessionId } = conversation;

    const isStateful = activeAgentSessionId !== null;

    const bufferLength = await this.messageWindowService.pushMessageToBuffer(
      conversationId,
      event.content.text,
      isStateful ? 60000 : 90000,
    );

    const canOpenWindow = await this.messageWindowService.tryOpenWindow(
      conversationId,
      isStateful ? 60000 : 90000,
    );

    if (!canOpenWindow) {
      this.logger.log(`Window already open for conversation ${conversationId}.`);

      if (bufferLength > 1) {
        const extended = await this.messageWindowService.tryExtendWindow(
          conversationId,
          isStateful ? 60000 : 90000,
        );

        if (extended) {
          this.logger.log(`Extended window by 4 seconds for conversation ${conversationId}`);
        } else {
          this.logger.log(
            `Window already extended, no further extensions for conversation ${conversationId}.`,
          );
        }
      }

      throw new EarlyTerminationError(`Message added to buffer and pending to be processed`);
    }

    let isProcessing = await this.messageWindowService.isProcessingConversation(conversationId);
    while (isProcessing) {
      this.logger.warn(`Another process is handling conversation ${conversationId}, waiting 2s`);
      await Utils.sleep(2000);
      isProcessing = await this.messageWindowService.isProcessingConversation(conversationId);
    }

    this.logger.log(`Opening response window for conversation ${conversationId}`);
    await Utils.sleep(isStateful ? 15000 : 8000);

    const wasExtended = await this.messageWindowService.wasWindowExtended(conversationId);
    if (wasExtended) {
      this.logger.log(`Extension detected for conversation ${conversationId}, waiting another 4s`);
      await Utils.sleep(4000);
    }

    await this.messageWindowService.startProcessing(conversationId);

    await this.messageWindowService.deleteWindow(conversationId);
    const contents = await this.messageWindowService.getProcessingContent(conversationId);
    event.content.text = contents.join('. ');
  }
}
