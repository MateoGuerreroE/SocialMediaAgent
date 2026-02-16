import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { ConsoleLogger } from '@nestjs/common';
import { Job } from 'bullmq';

@Processor('agent-crm-integration', {
  concurrency: 5,
  limiter: {
    max: 50,
    duration: 1000,
  },
})
export class CrmIntegrationWorker extends WorkerHost {
  constructor(private readonly logger: ConsoleLogger) {
    super();
  }

  async process(job: Job<any>): Promise<void> {
    this.logger.log(`Handling CRM integration event: ${JSON.stringify(job.data)}`);
    return Promise.resolve();
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
