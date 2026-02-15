import {
  Body,
  ConsoleLogger,
  Controller,
  Get,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebhookRoutingService } from './WebhookRouting.service';
import { FacebookEvent, InstagramEvent, type MetaEntry } from './types';

@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly configService: ConfigService,
    private readonly webhookRoutingService: WebhookRoutingService,
    private readonly logger: ConsoleLogger,
  ) {}

  @Get('/facebook')
  verifyFacebook(@Query() params: Record<string, string>) {
    return this.verifyWebhook(params);
  }

  @Get('/instagram')
  verifyInstagram(@Query() params: Record<string, string>) {
    return this.verifyWebhook(params);
  }

  @Post('/facebook')
  async receiveFacebook(@Body() body: MetaEntry<FacebookEvent>) {
    return this.webhookRoutingService.routeFacebookEvent(body.entry[0]);
  }

  @Post('/instagram')
  async receiveInstagram(@Body() body: MetaEntry<InstagramEvent>) {
    return this.webhookRoutingService.routeInstagramEvent(body.entry[0]);
  }

  private verifyWebhook(params: Record<string, string>) {
    const { 'hub.challenge': challenge, 'hub.verify_token': verifyToken } = params;
    const webhookVerifyToken = this.configService.get<string>('WEBHOOK_VERIFY_TOKEN');
    this.logger.log(`Verifying webhook with token`);

    if (verifyToken === webhookVerifyToken) {
      this.logger.log('Webhook verification successful');
      return challenge;
    }

    throw new UnauthorizedException('Invalid verify token');
  }
}
