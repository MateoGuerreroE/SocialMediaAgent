import {
  AgentActionType,
  AgentKey,
  AgentSessionStatus,
  ApplicationActor,
  CredentialType,
  MessageSource,
  OriginalContentType,
  Platform,
  PlatformChannel,
} from '../generated/prisma/enums';

export interface ClientEntity {
  clientId: string;
  businessName: string;
  industry: string;
  businessLocation: string;
  businessDescription: string;
  businessHours: string;
  contactOptions: string;
  dynamicInformation: string | null;
  whatsappNumber: string | null;
  instagramAccountId: string | null;
  facebookAccountId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;

  events?: ClientEventEntity[];
  credentials?: ClientCredentialEntity[];
  agents?: AgentEntity[];
}

export interface ClientEventEntity {
  eventId: string;
  clientId: string;
  eventName: string;
  description: string;
  recurrence: string;
  startDate: Date | null;
  endDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClientCredentialEntity {
  clientCredentialId: string;
  clientId: string;
  type: CredentialType;
  expiresAt: Date | null;
  value: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationEntity {
  conversationId: string;
  accountId: string;
  clientId: string;
  activeAgentSessionId: string | null;
  platform: Platform;
  channel: PlatformChannel;
  commentSourceId: string | null;
  senderId: string;
  postId: string | null;
  parentId: string | null;
  senderUsername: string | null;
  pausedUntil: Date | null;
  lastMessageAt: Date;
  createdAt: Date;

  messages?: ConversationMessageEntity[];
  session?: AgentSessionEntity;
}

export interface ConversationMessageEntity {
  messageId: string;
  conversationId: string;
  content: string;
  originalContentType: OriginalContentType;
  originalSourceUrl: string | null;
  externalId: string;
  sentBy: ApplicationActor;
  source: MessageSource;
  isDeleted: boolean;
  deletedAt: Date | null;
  receivedAt: Date;
  agentSessionId: string | null;
}

export interface AgentEntity {
  agentId: string;
  clientId: string;
  agentKey: AgentKey;
  name: string;
  useCase: string;
  isActive: boolean;
  configuration: any; // TODO TYPE THIS!! -> Examples, tone, general model rules, general retry rules, etc.
  createdAt: Date;
  updatedAt: Date;

  variants?: AgentVariantEntity[];
  policies?: AgentPolicyEntity[];
}

export interface AgentSessionEntity {
  sessionId: string;
  agentId: string;
  agentKey: AgentKey;
  startedAt: Date;
  endedAt: Date | null;
  status: AgentSessionStatus;
  summary: string | null;
  conversationId: string;
  state: any; // TODO TYPES THIS
  result: any | null;
}

export interface AgentActionEntity {
  actionId: string;
  agentId: string;
  actionType: AgentActionType;
  useCase: string;
  isActive: boolean;
  configuration: any; // TODO TYPE THIS!! -> Depends on the action, for example for an alert action it would be the alert channel, the target, etc.
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentVariantEntity {
  variantId: string;
  agentId: string;
  platform: Platform | null;
  channel: PlatformChannel | null;
  overrideConfiguration: any; // TODO TYPE THIS!! -> Depends on the action, for example for an alert action it would be the alert channel, the target, etc.
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentPolicyEntity {
  policyId: string;
  agentId: string;
  platform: Platform | null;
  channel: PlatformChannel | null;
  isAllowed: boolean;
  createdAt: Date;
  updatedAt: Date;
}
