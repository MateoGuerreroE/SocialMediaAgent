import { ConsoleLogger, Injectable } from '@nestjs/common';
import { SocialMediaEvent } from '../types/messages';
import { ClientService } from '../client';
import { ConversationService } from '../messaging/Conversation.service';
import {
  AgentEntity,
  ClientEntity,
  ClientPlatformEntity,
  ConversationEntity,
  PlatformCredentialEntity,
} from '../types/entities';
import { Platform, PlatformChannel } from '../generated/prisma/enums';
import { GenerationService } from '../generation';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { MessageWindowService } from '../messaging/MessageWindow.service';
import { EarlyTerminationError } from '../types/errors/EarlyTerminationError';
import { AgentLogRepository } from 'src/data/repository';
import { WorkerJobData } from 'src/agent/types';
import { Utils } from 'src/utils';
import { AgentService } from 'src/agent/Agent.service';

@Injectable()
export class OrchestrationService {
  constructor(
    private readonly logger: ConsoleLogger,
    private readonly clientService: ClientService,
    private readonly conversationService: ConversationService,
    private readonly generationService: GenerationService,
    private readonly messageWindowService: MessageWindowService,
    private readonly agentLogRepository: AgentLogRepository,
    private readonly agentService: AgentService,
    @InjectQueue('agent-community-manager') private readonly agentCommunityManagerQueue: Queue,
    @InjectQueue('agent-crm-integration') private readonly agentCrmIntegrationQueue: Queue,
    @InjectQueue('agent-booking-manager') private readonly agentBookingManagerQueue: Queue,
    @InjectQueue('agent-confirm-assistant') private readonly agentConfirmAssistantQueue: Queue,
  ) {}

  async orchestrateEvent(event: SocialMediaEvent): Promise<void> {
    try {
      if (event.eventType === 'deleted') {
        await this.conversationService.deleteMessage(event.metadata.externalId);
        return;
      }

      if (event.eventType === 'updated') {
        this.logger.warn(`UPDATE case received. This is not implemented yet`);
        return;
      }

      const messageExists = await this.conversationService.checkIfMessageExists(
        event.metadata.externalId,
      );
      if (messageExists) {
        this.logger.warn(
          `Message with externalId ${event.metadata.externalId} already exists. Skipping processing.`,
        );
        return;
      }

      const platform = await this.clientService.getPlatformByAccountId(
        event.accountId,
        event.platform,
      );

      const { canProcess, credential } = this.verifyPlatform(
        platform,
        event.platform,
        event.channel,
      );

      if (!canProcess || !credential) return;

      const client = await this.clientService.getClientById(platform.clientId);

      const canClientProcess = this.verifyClient(client);
      if (!canClientProcess) return;

      const conversation = await this.conversationService.getOrCreateConversation(
        event,
        client.clientId,
      );

      const canConversationProcess = await this.verifyConversation(conversation);
      if (!canConversationProcess) return;

      if (event.channel === PlatformChannel.DIRECT_MESSAGE) {
        await this.bufferDMMessageForConversation(conversation, event);
      }
      await this.conversationService.addUserMessage(conversation, event);

      if (platform.requiresConfirmation) {
        if (conversation.isConfirmed === null) {
          this.logger.warn(
            `Client requires confirmation for platform and received conversation is not confirmed. Routing to assistant`,
          );
          await this.agentConfirmAssistantQueue.add('handleConfirmation', {
            conversation,
            client,
            platform,
            credential,
            targetId: event.targetId,
          });

          return;
        } else if (conversation.isConfirmed === false) {
          this.logger.warn(
            `Conversation ${conversation.conversationId} has been flagged as not confirmed. Skipping processing.`,
          );
          return;
        }
      }

      const selectedAgent = await this.requireAgentDecision({
        agents: client.agents!,
        conversation,
        message: event.content.text,
        messageId: event.messageId,
      });

      await this.routeToQueue({
        targetId: event.targetId,
        agent: selectedAgent,
        conversation,
        credential,
        client: {
          ...client,
          agents: [], // Cleanup agents to avoid sending unnecessary data to the worker
        },
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
    agent,
    conversation,
    client,
    credential,
    targetId,
  }: {
    agent: AgentEntity;
    conversation: ConversationEntity;
    client: ClientEntity;
    credential: PlatformCredentialEntity;
    targetId: string;
  }) {
    const payload: WorkerJobData = {
      conversation,
      client,
      targetId,
      agent,
      credential,
    };
    const jobId = Utils.generateUUID();

    switch (agent.agentKey) {
      case 'COMMUNITY_MANAGER':
        await this.agentCommunityManagerQueue.add('handleEvent', payload, {
          jobId,
          removeOnComplete: { age: 60 },
        });
        break;
      case 'CRM_INTEGRATION':
        await this.agentCrmIntegrationQueue.add('handleEvent', payload, {
          jobId,
          removeOnComplete: { age: 60 },
        });
        break;
      case 'BOOKING_MANAGER':
        await this.agentBookingManagerQueue.add('handleEvent', payload, {
          jobId,
          removeOnComplete: { age: 60 },
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
  }): Promise<AgentEntity> {
    if (conversation.session) {
      const sessionAgent = agents.find(
        (agent) => agent.agentKey === conversation.session!.agentKey,
      );
      if (sessionAgent && sessionAgent.isActive) {
        this.logger.debug(
          `Existing session found for conversation ${conversation.conversationId}. Automatically selecting agent ${sessionAgent.agentKey}.`,
        );
        return sessionAgent;
      }
    }
    const activeAgents = agents.filter(
      (agent) =>
        agent.isActive &&
        this.agentService.checkAgentPolicies(agent, conversation.platform, conversation.channel),
    );

    if (activeAgents.length === 0) {
      throw new EarlyTerminationError(
        `No active agents available for conversation ${conversation.conversationId}.`,
      );
    }

    if (activeAgents.length === 1) {
      this.logger.log(
        `Only one agent available (${activeAgents[0].agentKey}). Automatically selecting this agent.`,
      );
      return activeAgents[0];
    }

    const decision = await this.generationService.requestAgentDecision(activeAgents, message);

    const selectedAgent = activeAgents.find((agent) => agent.agentKey === decision.agent);
    if (!selectedAgent) {
      this.logger.warn(
        `Model returned an invalid agent key: ${decision.agent}. Defaulting to first agent in the list.`,
      );
      return activeAgents[0];
    }
    this.logger.log(
      `Agent ${selectedAgent.agentKey} selected by model with confidence ${decision.decisionScore}.`,
    );

    await this.agentLogRepository.createLog({
      logId: Utils.generateUUID(),
      agentId: selectedAgent.agentId,
      messageId,
      decisionScore: decision.decisionScore,
      reason: decision.reason,
      conversationId: conversation.conversationId,
      message,
    });

    return selectedAgent;
  }

  verifyPlatform(
    clientPlatform: ClientPlatformEntity,
    platform: Platform,
    channel: PlatformChannel,
  ): { canProcess: boolean; credential: PlatformCredentialEntity | null } {
    if (clientPlatform.platform !== platform) {
      this.logger.warn(
        `Client platform ${clientPlatform.platform} does not match event platform ${platform}. Skipping event processing.`,
      );
      return { canProcess: false, credential: null };
    }

    const requiredCredential = Utils.resolveRequiredCredential(platform, channel);
    const credential = clientPlatform.credentials?.find((cred) => cred.type === requiredCredential);
    if (!credential) {
      this.logger.warn(
        `Client platform ${clientPlatform.platform} does not have the required credential ${requiredCredential} for channel ${channel}. Skipping event processing.`,
      );
      return { canProcess: false, credential: null };
    }

    if (credential.expiresAt && credential.expiresAt < new Date()) {
      this.logger.warn(
        `Client platform ${clientPlatform.platform} has an expired credential ${credential.credentialId}. Skipping event processing.`,
      );
      return { canProcess: false, credential: null };
    }

    return { canProcess: true, credential };
  }

  verifyClient(client: ClientEntity): boolean {
    const { businessName, isActive } = client;

    if (!isActive) {
      this.logger.warn(`Client ${businessName} is inactive. Skipping event processing.`);
      return false;
    }

    // const targetPlatform = platforms.find((p) => p.platform === platform);

    // if (!targetPlatform) {
    //   this.logger.warn(
    //     `Client ${businessName} does not have a ${platform} account configured. Skipping event processing.`,
    //   );
    //   return false;
    // }

    // // Check credentials exist
    // if (!targetPlatform.credentials.length) {
    //   this.logger.warn(
    //     `Client ${businessName} does not have any credentials configured or they are expired. Skipping event processing.`,
    //   );
    //   return false;
    // }

    // const requiredCredential = Utils.resolveRequiredCredential(platform, channel);
    // if (!targetPlatform.credentials.some((cred) => cred.type === requiredCredential)) {
    //   this.logger.warn(
    //     `Client ${businessName} does not have the required credential ${requiredCredential} for platform ${platform} and channel ${channel}. Skipping event processing.`,
    //   );
    //   return false;
    // }

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

  async verifyConversation(conversation: ConversationEntity): Promise<boolean> {
    if (conversation.pausedUntil) {
      if (conversation.pausedUntil > new Date()) {
        this.logger.warn(
          `Conversation ${conversation.conversationId} is paused until ${conversation.pausedUntil.toDateString()}. Skipping event processing.`,
        );
        return false;
      } else {
        this.logger.log(
          `Conversation ${conversation.conversationId} pause has expired. Resuming processing.`,
        );
        await this.conversationService.resumeConversation(conversation.conversationId);
      }
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
    await Utils.sleep(isStateful ? 20000 : 12000);

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
