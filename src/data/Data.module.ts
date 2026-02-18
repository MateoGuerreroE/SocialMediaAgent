import { Module } from '@nestjs/common';
import { PrismaService } from './Prisma.service';
import { ClientRepository } from './repository/Client.repository';
import { RedisService } from './Redis.service';
import {
  AgentActionPolicyRepository,
  AgentActionRepository,
  AgentActionVariantRepository,
  ClientCredentialRepository,
  ClientEventRepository,
  ConversationMessageRepository,
  ConversationRepository,
} from './repository';
import { AgentLogRepository } from './repository/AgentLog.repository';

@Module({
  providers: [
    PrismaService,
    ClientRepository,
    RedisService,
    ClientCredentialRepository,
    ConversationRepository,
    AgentActionRepository,
    AgentActionVariantRepository,
    AgentActionPolicyRepository,
    AgentLogRepository,
    ConversationMessageRepository,
    ClientEventRepository,
  ],
  exports: [
    ClientRepository,
    RedisService,
    ClientCredentialRepository,
    ConversationRepository,
    AgentLogRepository,
    AgentActionRepository,
    AgentActionVariantRepository,
    AgentActionPolicyRepository,
    ConversationMessageRepository,
    ClientEventRepository,
  ],
})
export class DataModule {}
