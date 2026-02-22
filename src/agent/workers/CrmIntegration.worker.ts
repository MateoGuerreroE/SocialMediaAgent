import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { ConsoleLogger } from '@nestjs/common';
import { Job } from 'bullmq';
import { WorkerJobData } from '../types';
import { CrmIntegrationHandler } from '../handlers/CrmIntegration.handler';
import { MessageWindowService } from 'src/messaging/MessageWindow.service';

@Processor('agent-crm-integration', {
  concurrency: 5,
  limiter: {
    max: 50,
    duration: 1000,
  },
})
export class CrmIntegrationWorker extends WorkerHost {
  constructor(
    private readonly logger: ConsoleLogger,
    private readonly messageWindowService: MessageWindowService,
    private readonly crmIntegrationHandler: CrmIntegrationHandler,
  ) {
    super();
  }

  async process(job: Job<WorkerJobData>): Promise<void> {
    this.logger.log(`Processing CRM Integration Job ${job.id} for agent ${job.data.agent.agentId}`);
    const { client, conversation, agent, credential } = job.data;
    try {
      const targetId = job.data.targetId;

      await this.crmIntegrationHandler.handle({
        credential,
        client,
        conversation,
        agent,
        targetId,
      });
    } catch (e) {
      this.logger.error(`Unable to process CRM Integration Job: ${e.message}`);
    } finally {
      await this.messageWindowService.deleteProcessingKey(conversation.conversationId);
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`CRM Integration Job ${job.id} completed successfully`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`CRM Integration Job ${job?.id} failed with error: ${error.message}`);
  }
}
