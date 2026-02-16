import { Injectable } from '@nestjs/common';
import { RedisService } from '../data';

@Injectable()
export class MessageWindowService {
  constructor(private readonly redis: RedisService) {}

  bufferKey(conversationId: string) {
    return `buffer:${conversationId}`;
  }

  windowKey(conversationId: string) {
    return `window:${conversationId}`;
  }

  processKey(conversationId: string) {
    return `process:${conversationId}`;
  }

  extensionKey(conversationId: string) {
    return `extension:${conversationId}`;
  }

  async isProcessingConversation(conversationId: string): Promise<boolean> {
    const processKey = this.processKey(conversationId);
    const exists = await this.redis.exists(processKey);
    return exists === 1;
  }

  async getProcessingContent(conversationId: string): Promise<string[]> {
    const processKey = this.processKey(conversationId);
    const messages = await this.redis.lrange(processKey, 0, -1);
    return messages;
  }

  async deleteProcessingKey(conversationId: string): Promise<void> {
    const processKey = this.processKey(conversationId);
    await this.redis.del(processKey);
  }

  /**
   * Store a user message in the buffer list.
   * TTL is a safety net; set it only when the list is created (len === 1).
   */
  async pushMessageToBuffer(
    conversationId: string,
    message: string,
    ttlMs: number,
  ): Promise<number> {
    const key = this.bufferKey(conversationId);
    const len = await this.redis.rpush(key, message);

    // Set TTL only when created (avoids pexpire on every message)
    if (len === 1) {
      await this.redis.pexpire(key, ttlMs);
    }

    return len;
  }

  async tryOpenWindow(conversationId: string, windowMs: number): Promise<boolean> {
    const key = this.windowKey(conversationId);

    const res = await this.redis.set(key, '1', 'PX', windowMs, 'NX');
    return res === 'OK';
  }

  async startProcessing(conversationId: string): Promise<string | null> {
    const bufferKey = this.bufferKey(conversationId);
    const processKey = this.processKey(conversationId);

    const moved = await this.redis.renamenx(bufferKey, processKey);
    if (moved === 0) return null;

    return processKey;
  }

  async getMessagesAndDeleteKey(processKey: string): Promise<string[]> {
    const messages = await this.redis.lrange(processKey, 0, -1);
    await this.redis.del(processKey);
    return messages;
  }

  async deleteWindow(conversationId: string): Promise<void> {
    await this.redis.del(this.windowKey(conversationId), this.extensionKey(conversationId));
  }

  async tryExtendWindow(conversationId: string, extensionMs: number): Promise<boolean> {
    const extKey = this.extensionKey(conversationId);

    const res = await this.redis.set(extKey, '1', 'PX', extensionMs, 'NX');
    return res === 'OK';
  }

  async wasWindowExtended(conversationId: string): Promise<boolean> {
    const extKey = this.extensionKey(conversationId);
    const exists = await this.redis.exists(extKey);
    return exists === 1;
  }

  async getOrphanMessages(conversationId: string): Promise<string[]> {
    const windowKey = this.windowKey(conversationId);
    const key = this.bufferKey(conversationId);

    const windowExists = await this.redis.exists(windowKey);
    if (windowExists === 1) return [];

    return this.getMessagesAndDeleteKey(key);
  }
}
