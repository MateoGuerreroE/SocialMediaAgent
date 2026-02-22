import {
  AgentEntity,
  ClientEntity,
  ClientPlatformEntity,
  ConversationEntity,
  PlatformCredentialEntity,
} from 'src/types/entities';

export interface WorkerJobData {
  client: ClientEntity;
  targetId: string;
  credential: PlatformCredentialEntity;
  conversation: ConversationEntity;
  agent: AgentEntity;
}

export interface RequiredField {
  key: string;
  type: 'string' | 'number' | 'boolean';
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
  credential: PlatformCredentialEntity;
  conversation: ConversationEntity;
}
