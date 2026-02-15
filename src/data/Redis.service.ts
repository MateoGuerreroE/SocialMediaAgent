import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService extends Redis implements OnModuleInit, OnModuleDestroy {
  constructor(configService: ConfigService) {
    const redisHost = configService.get<string>('REDIS_HOST');
    const redisPort = configService.get<number>('REDIS_PORT');
    if (!redisHost || !redisPort) {
      throw new Error('REDIS_HOST or REDIS_PORT environment variable is not set');
    }

    super({
      host: redisHost,
      port: redisPort,
    });
  }

  async onModuleInit() {
    await this.ping();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }
}
