import { AgentEntity, ClientEntity, ConversationEntity } from 'src/types/entities';
import { SocialMediaEvent } from 'src/types/messages';

export interface WorkerJobData {
  client: ClientEntity;
  event: SocialMediaEvent;
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
