import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST'),
          port: configService.get<number>('REDIS_PORT'),
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      { name: 'orchestration' },
      { name: 'agent-community-manager' },
      { name: 'agent-crm-integration' },
      { name: 'agent-booking-manager' },
      { name: 'agent-confirm-assistant' },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
