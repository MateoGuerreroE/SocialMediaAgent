import { MessageSource, Platform, PlatformChannel } from '../generated/prisma/enums';

export type EventType = 'created' | 'updated' | 'deleted';

export type SocialMediaEventContent = {
  text: string;
  originalType: 'text' | 'audio' | 'image';
  originalContentUrl?: string; // URL to the original content if it's not texts
};

export interface SocialMediaEvent {
  accountId: string;
  messageId: string; // ID to have the message created in the system
  eventType: EventType;
  targetId: string; // Either senderId or commentId -> This is where the system needs to send the response to
  content: SocialMediaEventContent;
  timestamp: number;
  platform: Platform;
  channel: PlatformChannel;
  metadata: SocialMediaEventMetadata;
}

export interface SocialMediaEventMetadata {
  externalId: string; // Either messageId or commentId
  source: MessageSource;
  parentId?: string;
  postId?: string;
  sender: {
    id: string;
    name?: string;
    username?: string;
    phone?: string;
  };
}
