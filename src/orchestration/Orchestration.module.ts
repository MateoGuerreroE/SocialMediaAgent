import { Module } from '@nestjs/common';
import { OrchestrationService } from './Orchestration.service';
import { OrchestrationWorker } from './Orchestration.worker';
import { ClientModule } from '../client/Client.module';
import { MessagingModule } from '../messaging/Messaging.module';
import { QueueModule } from '../queue/Queue.module';
import { GenerationModule } from '../generation/Generation.module';
import { DataModule } from 'src/data/Data.module';

@Module({
  imports: [QueueModule, ClientModule, MessagingModule, GenerationModule, QueueModule, DataModule],
  providers: [OrchestrationService, OrchestrationWorker],
})
export class OrchestrationModule {}
