import { Module } from '@nestjs/common';
import { PrismaService } from './Prisma.service';
import { ClientRepository } from './repository/Client.repository';
import { RedisService } from './Redis.service';
import { ClientCredentialRepository, ClientEventRepository } from './repository';

@Module({
  providers: [
    PrismaService,
    ClientRepository,
    RedisService,
    ClientCredentialRepository,
    ClientEventRepository,
  ],
  exports: [ClientRepository, RedisService, ClientCredentialRepository, ClientEventRepository],
})
export class DataModule {}
