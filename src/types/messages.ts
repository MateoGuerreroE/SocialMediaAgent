import { MessageSource, Platform, PlatformChannel } from '../generated/prisma/enums';

export type EventType = 'created' | 'updated' | 'deleted';

export type ApplicationEventContent = {
  text: string;
  originalType: 'text' | 'audio' | 'image';
  originalContentUrl?: string; // URL to the original content if it's not texts
};

export interface SocialMediaEvent {
  accountId: string;
  messageId: string; // ID to have the message created in the system
  eventType: EventType;
  targetId: string; // Either senderId or commentId -> This is where the system needs to send the response to
  content: ApplicationEventContent;
  timestamp: number;
  platform: Platform;
  channel: PlatformChannel;
  metadata: ApplicationEventMetadata;
}

export interface ApplicationEventMetadata {
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
