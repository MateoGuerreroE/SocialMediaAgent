import { ConsoleLogger, Injectable } from '@nestjs/common';
import {
  FacebookDMEvent,
  FacebookEvent,
  InstagramDMEvent,
  InstagramEvent,
  MetaDMData,
} from './types';
import { SocialMediaEvent, SocialMediaEventContent } from '../types/messages';
import { MessageSource, Platform, PlatformChannel } from '../generated/prisma/enums';

@Injectable()
export class WebhookRoutingService {
  constructor(private readonly logger: ConsoleLogger) {}

  async routeInstagramEvent(event: InstagramEvent): Promise<void> {
    this.logger.log(`Received Instagram event for account ${event.id}`);
    try {
      const parsedEvent = this.parseInstagramEvent(event);
      if (!parsedEvent) {
        this.logger.warn(`Unsupported Instagram event ${JSON.stringify(event, null, 2)}`);
        return;
      }

      await Promise.resolve();
    } catch (e) {
      this.logger.error(
        `Error parsing Instagram event: ${e instanceof Error ? e.message : String(e)}`,
      );
      this.logger.warn(`Failed to parse Instagram event ${JSON.stringify(event, null, 2)}`);
      return;
    }
  }

  async routeFacebookEvent(event: FacebookEvent) {
    this.logger.log(`Received Facebook event for account ${event.id}`);
    try {
      const parsedEvent = this.parseFacebookEvent(event);
      if (!parsedEvent) {
        this.logger.warn(`Unsupported Facebook event ${JSON.stringify(event, null, 2)}`);
        return;
      }

      await Promise.resolve();
    } catch (e) {
      this.logger.error(
        `Error parsing Facebook event: ${e instanceof Error ? e.message : String(e)}`,
      );
      this.logger.warn(`Failed to parse Facebook event ${JSON.stringify(event, null, 2)}`);
      return;
    }
  }

  private parseInstagramEvent(payload: InstagramEvent): SocialMediaEvent | null {
    const messageId = crypto.randomUUID();
    if ('changes' in payload) {
      // Instagram Comment
      const senderId = payload.changes[0]?.value?.from?.id;
      if (!senderId) {
        throw new Error('Sender ID not found in Instagram comment message');
      }

      if (!payload.changes || payload.changes.length === 0) {
        throw new Error('No changes found in comment message');
      }

      const igContents = payload.changes[0];
      if (!igContents.value?.text || igContents.value?.text?.length === 0) {
        throw new Error('Unable to find text content in the comment');
      }

      const commentPayload: SocialMediaEvent = {
        messageId,
        accountId: payload.id,
        targetId: igContents.value.id,
        eventType: 'created',
        timestamp: payload.time,
        platform: Platform.INSTAGRAM,
        channel: PlatformChannel.COMMENT,
        metadata: {
          parentId: igContents.value.parent_id,
          postId: igContents.value.media.id,
          source: MessageSource.DIRECT, // TODO Adapt this to identify Ads
          sender: {
            id: senderId,
            name: igContents.value.from.username,
          },
          externalId: igContents.value.id,
        },
        content: { text: igContents.value.text, originalType: 'text' },
      };

      return commentPayload;
    } else if ('messaging' in payload) {
      // Instagram DM
      return this.parseDMEvent(messageId, payload, Platform.INSTAGRAM);
    }

    throw new Error('Unsupported Instagram message type');
  }

  private parseFacebookEvent(payload: FacebookEvent): SocialMediaEvent | null {
    const messageId = crypto.randomUUID();
    if ('changes' in payload) {
      // Facebook Comment
      const senderId = payload.changes[0]?.value?.from?.id;
      if (!senderId) {
        throw new Error('Sender ID not found in Facebook comment message');
      }

      if (!payload.changes || payload.changes.length === 0) {
        throw new Error('No changes found in comment message');
      }

      const fbContents = payload.changes[0];
      if (fbContents.value.item !== 'comment') {
        throw new Error(
          `Unsupported Facebook comment item type: ${fbContents.value.item as string}`,
        );
      }

      if (!fbContents.value?.message && fbContents.value.verb !== 'remove') {
        throw new Error('Unable to find text content in the comment');
      }

      const commentPayload: SocialMediaEvent = {
        targetId: fbContents.value.comment_id,
        accountId: payload.id,
        timestamp: payload.time,
        messageId,
        platform: Platform.FACEBOOK,
        channel: PlatformChannel.COMMENT,
        metadata: {
          parentId: fbContents.value.parent_id,
          source: MessageSource.DIRECT, // TODO Adapt this to identify Ads
          sender: {
            id: senderId,
            name: fbContents.value.from.name,
          },
          postId: fbContents.value.post_id,
          externalId: fbContents.value.comment_id,
        },
        eventType: this.resolveEventType(undefined, fbContents.value.verb),
        content: {
          text:
            fbContents.value.verb === 'remove'
              ? fbContents.value.comment_id
              : fbContents.value.message,
          originalType: 'text',
        },
      };

      return commentPayload;
    } else if ('messaging' in payload) {
      // Facebook DM
      return this.parseDMEvent(messageId, payload, Platform.FACEBOOK);
    }

    throw new Error('Unsupported Facebook message type');
  }

  private parseDMEvent(
    messageId: string,
    payload: InstagramDMEvent | FacebookDMEvent,
    platform: Platform,
  ): SocialMediaEvent | null {
    if (!('messaging' in payload)) {
      throw new Error('Invalid DM payload structure');
    }

    const messageData = payload.messaging[0];

    if (!messageData || !messageData.message) {
      throw new Error('Invalid message event structure');
    }

    const senderId = messageData.sender.id;
    if (!senderId) {
      throw new Error('Sender ID not found in message event');
    }

    const isStoryMention = this.isStoryMentionMessage(messageData.message);

    const content = isStoryMention
      ? { text: messageData.message.text ?? '', originalType: 'text' as const }
      : this.getContent(messageData.message);

    if (!content) {
      return null;
    }

    return {
      targetId: senderId,
      accountId: payload.id,
      messageId,
      timestamp: payload.time,
      platform,
      channel: PlatformChannel.DIRECT_MESSAGE,
      metadata: {
        source: MessageSource.DIRECT, // TODO Adapt this to identify Ads
        externalId: messageData.message.mid,
        sender: {
          id: senderId,
        },
      },
      eventType: this.resolveEventType(messageData.message.is_deleted),
      content,
    };
  }

  private isStoryMentionMessage(message: MetaDMData): boolean {
    if (!message.attachments?.length) return false;
    return message.attachments.some((attachment) => {
      const type = attachment.type?.toLowerCase?.() ?? '';
      return type.includes('story');
    });
  }

  private getContent(message: MetaDMData): SocialMediaEventContent | null {
    if (message.text && message.text.length > 0) {
      return { text: message.text, originalType: 'text' };
    } else if (message.attachments && message.attachments.length > 0) {
      const attachment = message.attachments[0];

      // Log warning for unsupported media types that need conversion
      if (attachment.type === 'image' || attachment.type === 'audio') {
        this.logger.warn(
          `Unsupported ${attachment.type} attachment received. Media-to-text conversion not yet implemented.`,
        );
        return null;
      }
    }
    if (message.is_deleted) return { text: message.mid, originalType: 'text' };

    this.logger.warn('Unsupported message content type');
    return null;
  }

  private resolveEventType(isDeleted?: boolean, verb?: 'remove' | 'add' | 'edited') {
    if (isDeleted !== undefined) {
      return isDeleted ? 'deleted' : 'created';
    }
    switch (verb) {
      case 'remove':
        return 'deleted';
      case 'add':
        return 'created';
      case 'edited':
        return 'updated';
      default:
        return 'created';
    }
  }
}
