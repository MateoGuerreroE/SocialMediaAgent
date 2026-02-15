import { Module } from '@nestjs/common';
import { WebhookRoutingService } from './WebhookRouting.service';
import { WebhooksController } from './Webhooks.controller';
import { QueueModule } from '../queue/Queue.module';

@Module({
  imports: [QueueModule],
  controllers: [WebhooksController],
  providers: [WebhookRoutingService],
  exports: [],
})
export class IngressModule {}
