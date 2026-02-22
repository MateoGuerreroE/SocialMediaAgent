import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { ConsoleLogger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ConfirmationAssistantHandler } from '../handlers/ConfirmationAssistant.handler';
import { ConfirmationAssistantData } from '../types';
import { MessageWindowService } from '../../messaging/MessageWindow.service';

@Processor('agent-confirm-assistant', {
  concurrency: 10,
  limiter: {
    max: 100,
    duration: 1000,
  },
})
export class ConfirmAssistantWorker extends WorkerHost {
  constructor(
    private readonly logger: ConsoleLogger,
    private readonly messageWindowService: MessageWindowService,
    private readonly confirmationAssistantHandler: ConfirmationAssistantHandler,
  ) {
    super();
  }

  async process(job: Job<ConfirmationAssistantData>) {
    try {
      return this.confirmationAssistantHandler.handle(job.data);
    } catch (e) {
      this.logger.error(`Confirmation Assistant failed: ${(e as Error).message}`);
    } finally {
      await this.messageWindowService.deleteProcessingKey(job.data.conversation.conversationId);
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Confirm Assistant job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Confirm Assistant job ${job?.id} failed with error: ${error.message}`);
  }
}
