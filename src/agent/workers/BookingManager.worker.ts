import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { ConsoleLogger } from '@nestjs/common';
import { Job } from 'bullmq';
import { BookingManagerHandler } from '../handlers/BookingManager.handler';
import { WorkerJobData } from '../types';
import { MessageWindowService } from 'src/messaging/MessageWindow.service';

@Processor('agent-booking-manager', {
  concurrency: 5,
  limiter: {
    max: 50,
    duration: 1000,
  },
})
export class BookingManagerWorker extends WorkerHost {
  constructor(
    private readonly logger: ConsoleLogger,
    private readonly bookingManager: BookingManagerHandler,
    private readonly messageWindowService: MessageWindowService,
  ) {
    super();
  }

  async process(job: Job<WorkerJobData>): Promise<void> {
    this.logger.log(`Processing Booking Manager Job ${job.id} for agent ${job.data.agent.agentId}`);
    try {
      await this.bookingManager.handle(job.data);
    } catch (e) {
      this.logger.error(`Unable to process Booking Manager Job: ${e.message}`);
    } finally {
      await this.messageWindowService.deleteProcessingKey(job.data.conversation.conversationId);
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Booking Manager Job ${job.id} completed successfully`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Booking Manager Job ${job?.id} failed with error: ${error.message}`);
  }
}
