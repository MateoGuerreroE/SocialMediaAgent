import { Module } from '@nestjs/common';
import { QueueService } from './Queue.service';

@Module({
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
