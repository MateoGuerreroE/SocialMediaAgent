import { Module } from '@nestjs/common';
import { CommunityManagerWorker } from './workers/CommunityManager.worker';
import { CrmIntegrationWorker } from './workers';
import { CommunityManagerHandler } from './handlers/CommunityManager.handler';
import { DataModule } from 'src/data/Data.module';
import { AlertAction } from './actions/Alert.action';
import { ReplyAction } from './actions/Reply.action';
import { GenerationModule } from 'src/generation/Generation.module';
import { AgentService } from './Agent.service';
import { AgentCacheService } from './AgentCache.service';
import { IngressModule } from 'src/ingress/Ingress.module';
import { MessagingModule } from 'src/messaging/Messaging.module';

@Module({
  imports: [DataModule, GenerationModule, IngressModule, MessagingModule],
  providers: [
    AgentService,
    AgentCacheService,
    CommunityManagerWorker,
    CrmIntegrationWorker,
    CommunityManagerHandler,
    AlertAction,
    ReplyAction,
  ],
})
export class AgentModule {}
