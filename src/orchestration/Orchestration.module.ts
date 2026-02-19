import { Module } from '@nestjs/common';
import { OrchestrationService } from './Orchestration.service';
import { OrchestrationWorker } from './Orchestration.worker';
import { ClientModule } from '../client/Client.module';
import { MessagingModule } from '../messaging/Messaging.module';
import { QueueModule } from '../queue/Queue.module';
import { GenerationModule } from '../generation/Generation.module';
import { DataModule } from 'src/data/Data.module';
import { AgentModule } from 'src/agent/Agent.module';

@Module({
  imports: [
    QueueModule,
    ClientModule,
    MessagingModule,
    GenerationModule,
    QueueModule,
    DataModule,
    AgentModule,
  ],
  providers: [OrchestrationService, OrchestrationWorker],
})
export class OrchestrationModule {}
