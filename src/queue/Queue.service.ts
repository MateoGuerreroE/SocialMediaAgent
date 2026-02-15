import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue, QueueOptions } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { AgentKey } from '../generated/prisma/enums';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private queues = new Map<string, Queue>();
  private redisConnection: { host: string; port: number };

  constructor(configService: ConfigService) {
    const redisHost = configService.get<string>('REDIS_HOST');
    const redisPort = configService.get<number>('REDIS_PORT');
    if (!redisHost || !redisPort) {
      throw new Error('REDIS_HOST or REDIS_PORT environment variable is not set');
    }

    this.redisConnection = { host: redisHost, port: redisPort };
  }

  getQueue(name: string, options?: Omit<QueueOptions, 'connection'>): Queue {
    if (this.queues.has(name)) {
      return this.queues.get(name)!;
    }

    const queue = new Queue(name, {
      ...options,
      connection: this.redisConnection,
    });

    this.queues.set(name, queue);
    return queue;
  }

  /**
   * Get orchestration queue
   */
  getOrchestrationQueue(): Queue {
    return this.getQueue('orchestration');
  }

  /**
   * Get agent-specific queue
   */
  getAgentQueue(agentKey: AgentKey): Queue {
    return this.getQueue(`agent:${agentKey}`);
  }

  async onModuleDestroy() {
    // Close all queues gracefully
    await Promise.all(Array.from(this.queues.values()).map((queue) => queue.close()));
    this.queues.clear();
  }
}
