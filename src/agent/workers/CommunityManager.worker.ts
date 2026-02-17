import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { ConsoleLogger } from '@nestjs/common';
import { Job } from 'bullmq';

@Processor('agent-community-manager', {
  concurrency: 5,
  limiter: {
    max: 50,
    duration: 1000,
  },
})
export class CommunityManagerWorker extends WorkerHost {
  constructor(private readonly logger: ConsoleLogger) {
    super();
  }

  async process(job: Job<any>): Promise<void> {
    this.logger.log(`Handling community manager event: ${JSON.stringify(job.data, null, 2)}`);
    return Promise.resolve();
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
