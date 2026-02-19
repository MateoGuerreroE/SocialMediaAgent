import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { ConsoleLogger } from '@nestjs/common';
import { Job } from 'bullmq';
import { CommunityManagerHandler } from '../handlers/CommunityManager.handler';
import { WorkerJobData } from '../types';
import { MessageWindowService } from 'src/messaging/MessageWindow.service';

@Processor('agent-community-manager', {
  concurrency: 5,
  limiter: {
    max: 50,
    duration: 1000,
  },
})
export class CommunityManagerWorker extends WorkerHost {
  constructor(
    private readonly logger: ConsoleLogger,
    private readonly messageWindowService: MessageWindowService,
    private readonly handler: CommunityManagerHandler,
  ) {
    super();
  }

  async process(job: Job<WorkerJobData>): Promise<void> {
    this.logger.log(
      `Processing Community Manager Job ${job.id} for agent ${job.data.agent.agentId}`,
    );
    const { client, conversation, agent } = job.data;
    try {
      const targetId = job.data.event.targetId;

      await this.handler.handle({
        client,
        conversation,
        agent,
        targetId,
      });
    } catch (e) {
      this.logger.error(`Unable to process Community Manager Job`);
    } finally {
      await this.messageWindowService.deleteProcessingKey(conversation.conversationId);
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Community Manager Job ${job.id} completed successfully`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Community Manager Job ${job?.id} failed with error: ${error.message}`);
  }
}
