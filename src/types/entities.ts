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
import { ActionConfigMap, AgentConfigOverride, AgentConfiguration, PlatformConfig } from './nested';

export interface ClientEntity {
  clientId: string;
  businessName: string;
  industry: string;
  businessLocation: string;
  businessDescription: string;
  businessHours: string;
  contactOptions: string;
  dynamicInformation: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;

  events?: ClientEventEntity[];
  platforms?: ClientPlatformEntity[];
  agents?: AgentEntity[];
  credentials?: ClientCredentialEntity[];
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

export interface ClientPlatformEntity {
  platformId: string;
  platform: Platform;
  clientId: string;
  accountId: string;
  requiresConfirmation: boolean;
  platformConfig: PlatformConfig;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClientCredentialEntity {
  credentialId: string;
  clientId: string;
  type: CredentialType;
  value: string;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationEntity {
  conversationId: string;
  accountId: string;
  clientId: string;
  activeAgentSessionId: string | null;
  platform: Platform;
  isConfirmed: boolean | null;
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
  configuration: AgentConfiguration;
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
  result: any;
}

export interface AgentActionEntity<T extends AgentActionType> {
  actionId: string;
  agentId: string;
  actionType: T;
  useCase: string;
  isActive: boolean;
  configuration: ActionConfigMap[T];
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentVariantEntity {
  variantId: string;
  agentId: string;
  platform: Platform | null;
  channel: PlatformChannel | null;
  overrideConfiguration: AgentConfigOverride;
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
