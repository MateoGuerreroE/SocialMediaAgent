import { Module } from '@nestjs/common';
import { PrismaService } from './Prisma.service';
import { ClientRepository } from './repository/Client.repository';
import { RedisService } from './Redis.service';
import {
  AgentPolicyRepository,
  AgentActionRepository,
  AgentVariantRepository,
  ClientCredentialRepository,
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
    ClientCredentialRepository,
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
    ClientCredentialRepository,
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
