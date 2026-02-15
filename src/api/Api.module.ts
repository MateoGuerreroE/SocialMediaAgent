import { Module } from '@nestjs/common';
import { ApiController } from './Api.controller';
import { ApiService } from './Api.service';
import { ClientModule } from '../client/Client.module';

@Module({
  imports: [ClientModule],
  controllers: [ApiController],
  providers: [ApiService],
})
export class ApiModule {}
