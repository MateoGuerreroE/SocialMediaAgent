# BullMQ Integration with @nestjs/bullmq

## What Changed

Migrated from raw BullMQ to `@nestjs/bullmq` for better NestJS integration.

## Benefits

- ✅ **Less boilerplate**: No manual Worker lifecycle management
- ✅ **Decorators**: Clean `@Processor`, `@OnWorkerEvent` syntax
- ✅ **Type safety**: Better TypeScript support
- ✅ **Single config**: Redis connection configured once in QueueModule
- ✅ **Dependency injection**: Inject queues with `@InjectQueue()`

## Queue Configuration

All queues are registered in [src/queue/Queue.module.ts](../queue/Queue.module.ts):

```typescript
BullModule.registerQueue(
  { name: 'orchestration' },
  { name: 'agent-community-manager' },
  { name: 'agent-crm-integration' },
  { name: 'agent-booking-manager' },
);
```

**Note:** BullMQ doesn't allow `:` in queue names, so use hyphens instead.

## Worker Pattern

Workers extend `WorkerHost` and use decorators:

```typescript
@Processor('queue-name', {
  concurrency: 10,
  limiter: { max: 100, duration: 1000 },
})
export class MyWorker extends WorkerHost {
  async process(job: Job<DataType>) {
    // Process job
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {}

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {}
}
```

## Injecting Queues

Use `@InjectQueue()` to get queue instances:

```typescript
constructor(
  @InjectQueue('orchestration') private readonly queue: Queue,
) {}

// Add jobs
await this.queue.add('job-name', data, { jobId: '123' });
```

## Example

See [src/agent/EXAMPLE_AGENT_WORKER.ts](../agent/EXAMPLE_AGENT_WORKER.ts) for complete examples.

## Migration Notes

- ❌ Removed `QueueService.getQueue()` helper
- ✅ Use `@InjectQueue('queue-name')` instead
- ❌ No more manual Worker instantiation
- ✅ Workers auto-start with module lifecycle
