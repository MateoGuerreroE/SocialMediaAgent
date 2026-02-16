import { ConsoleLogger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { OrchestrationService } from './Orchestration.service';
import { SocialMediaEvent } from '../types/messages';

@Processor('orchestration', {
  concurrency: 10,
  limiter: {
    max: 100,
    duration: 1000,
  },
})
export class OrchestrationWorker extends WorkerHost {
  constructor(
    private readonly logger: ConsoleLogger,
    private readonly orchestrationService: OrchestrationService,
  ) {
    super();
  }

  async process(job: Job<SocialMediaEvent>): Promise<any> {
    return this.orchestrationService.orchestrateEvent(job.data);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Job ${job.id} completed successfully`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job?.id} failed with error: ${error.message}`);
  }
}
