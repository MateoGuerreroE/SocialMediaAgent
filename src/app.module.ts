import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from '@nestjs/config';
import { ApiModule } from './api/Api.module';
import { LoggingModule } from './logging/Logging.module';

@Module({
  imports: [
    LoggingModule,
    ApiModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
