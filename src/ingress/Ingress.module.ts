import { Module } from '@nestjs/common';
import { WebhookRoutingService } from './WebhookRouting.service';
import { WebhooksController } from './Webhooks.controller';
import { QueueModule } from '../queue/Queue.module';
import { ClientModule } from 'src/client/Client.module';
import { WhatsappService } from './Whatsapp.service';

@Module({
  imports: [QueueModule, ClientModule],
  controllers: [WebhooksController],
  providers: [WebhookRoutingService, WhatsappService],
  exports: [WhatsappService],
})
export class IngressModule {}
