import { Module } from '@nestjs/common';
import { DataModule } from '../data/Data.module';
import { ClientCacheService } from './ClientCache.service';
import { ClientService } from './Client.service';

@Module({
  imports: [DataModule],
  providers: [ClientCacheService, ClientService],
  exports: [ClientService],
})
export class ClientModule {}
