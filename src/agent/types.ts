import {
  AgentEntity,
  ClientEntity,
  ClientPlatformEntity,
  ConversationEntity,
  ClientCredentialEntity,
} from 'src/types/entities';
import { SocialMediaEvent } from '../types/messages';

export interface WorkerJobData {
  client: ClientEntity;
  targetId: string;
  credential: ClientCredentialEntity;
  conversation: ConversationEntity;
  agent: AgentEntity;
}

export interface RequiredField {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'date';
  validationRegex?: string;
  options?: string[];
  isRequired: boolean;
}

export interface RetrievedField {
  key: string;
  value: string;
  confidence: number;
}

export interface ConfirmationAssistantData {
  platform: ClientPlatformEntity;
  client: ClientEntity;
  targetId: string;
  event: SocialMediaEvent;
  credential: ClientCredentialEntity;
  conversation: ConversationEntity;
}
