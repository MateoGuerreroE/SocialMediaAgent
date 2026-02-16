import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from '@nestjs/config';
import { ApiModule } from './api/Api.module';
import { LoggingModule } from './logging/Logging.module';
import { IngressModule } from './ingress/Ingress.module';
import { OrchestrationModule } from './orchestration/Orchestration.module';
import { AgentModule } from './agent/Agent.module';

@Module({
  imports: [
    LoggingModule,
    IngressModule,
    AgentModule,
    OrchestrationModule,
    ApiModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
