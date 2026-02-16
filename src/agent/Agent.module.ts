import { Module } from '@nestjs/common';
import { CommunityManagerWorker } from './workers/CommunityManager.worker';
import { CrmIntegrationWorker } from './workers';

@Module({
  imports: [],
  providers: [CommunityManagerWorker, CrmIntegrationWorker],
})
export class AgentModule {}
