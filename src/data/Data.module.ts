import { Module } from '@nestjs/common';
import { PrismaService } from './Prisma.service';
import { ClientRepository } from './repository/Client.repository';
import { RedisService } from './Redis.service';
import {
  ClientCredentialRepository,
  ClientEventRepository,
  ConversationMessageRepository,
  ConversationRepository,
} from './repository';

@Module({
  providers: [
    PrismaService,
    ClientRepository,
    RedisService,
    ClientCredentialRepository,
    ConversationRepository,
    ConversationMessageRepository,
    ClientEventRepository,
  ],
  exports: [
    ClientRepository,
    RedisService,
    ClientCredentialRepository,
    ConversationRepository,
    ConversationMessageRepository,
    ClientEventRepository,
  ],
})
export class DataModule {}
