import {
  ApplicationActor,
  MessageSource,
  OriginalContentType,
  Platform,
  PlatformChannel,
} from '../../generated/prisma/enums';

export interface CreateConversation {
  accountId: string;
  clientId: string;
  platform: Platform;
  channel: PlatformChannel;
  commentSourceId?: string;
  senderId: string;
  postId?: string;
  parentId?: string;
  senderUserName?: string;
  lastMessageAt: Date;
}

export interface CreateMessage {
  messageId: string;
  conversationId: string;
  externalId: string;
  content: string;
  originalContentType: OriginalContentType;
  originalSourceUrl?: string;
  sentBy: ApplicationActor;
  source: MessageSource;
  agentSessionId?: string;
}
