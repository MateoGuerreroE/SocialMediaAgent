import { Module } from '@nestjs/common';
import { PrismaService } from './Prisma.service';
import { ClientRepository } from './repository/Client.repository';
import { RedisService } from './Redis.service';
import {
  AgentPolicyRepository,
  AgentActionRepository,
  AgentVariantRepository,
  ClientPlatformRepository,
  PlatformCredentialRepository,
  ClientEventRepository,
  ConversationMessageRepository,
  ConversationRepository,
  AgentRepository,
  AgentSessionRepository,
} from './repository';
import { AgentLogRepository } from './repository/AgentLog.repository';

@Module({
  providers: [
    PrismaService,
    ClientRepository,
    RedisService,
    ClientPlatformRepository,
    PlatformCredentialRepository,
    ConversationRepository,
    AgentRepository,
    AgentActionRepository,
    AgentVariantRepository,
    AgentSessionRepository,
    AgentPolicyRepository,
    AgentLogRepository,
    ConversationMessageRepository,
    ClientEventRepository,
  ],
  exports: [
    ClientRepository,
    RedisService,
    ClientPlatformRepository,
    PlatformCredentialRepository,
    AgentRepository,
    ConversationRepository,
    AgentLogRepository,
    AgentActionRepository,
    AgentVariantRepository,
    AgentSessionRepository,
    AgentPolicyRepository,
    ConversationMessageRepository,
    ClientEventRepository,
  ],
})
export class DataModule {}
