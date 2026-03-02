import { ReplyRules } from 'src/generation/types';
import { AlertChannel } from './enums';
import { RequiredField } from '../agent/types';
import { AgentActionType } from '../generated/prisma/enums';

export interface AgentConfiguration {
  modelTier: number;
  replyRules: ReplyRules;
  examples?: Array<{
    message: string;
    isCorrect: boolean;
    reasoning: string;
  }>;
}

export type AgentConfigOverride = Partial<AgentConfiguration>;

export interface PlatformConfig {
  confirmation?: ConfirmationConfig;
  bannedSenders?: string[];
}

export interface ConfirmationConfig {
  question: string;
  flaggedPath: 'yes' | 'no';
}

export interface ExternalApiCallTemplate {
  call: 'send_crm';
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  body: string;
  variablesMapping: Record<string, string>;
}

export interface ExecuteExternalActionConfig {
  template: ExternalApiCallTemplate;
  timeoutMs: number;
  targetUrl: string;
  uniqueIdentifierField?: string;
  uniqueIdentifier?: string;
  summaryField?: string;
}

export interface AlertActionConfig {
  alertChannel: AlertChannel;
  alertTarget: string;
}

export interface CaptureDataConfig {
  confirmationContext: string;
  confirmationRequiredFields: RequiredField[];
  captureRequiredFields: RequiredField[];
}

export interface ReplyActionConfig {
  examples?: Array<{
    message: string;
    isCorrect: boolean;
    reasoning: string;
  }>;
}

export interface EscalateActionConfig {
  triggerCases: Array<{
    case: string;
    reasoning: string;
  }>;
}

export interface VerifyExternalActionConfig {
  template: ExternalApiCallTemplate;
  timeoutMs: number;
  targetUrl: string;
  expectedStatusCode: number;
  expectedResponseField?: string;
  expectedResponseValue?: string;
}

export type EmptyConfig = Record<string, never>;

export type ActionConfigMap = {
  [AgentActionType.ALERT]: AlertActionConfig;
  [AgentActionType.CAPTURE_DATA]: CaptureDataConfig;
  [AgentActionType.EXECUTE_EXTERNAL]: ExecuteExternalActionConfig;
  [AgentActionType.VERIFY_EXTERNAL]: VerifyExternalActionConfig;
  [AgentActionType.REPLY]: ReplyActionConfig;
  [AgentActionType.COMPLETE]: EmptyConfig;
  [AgentActionType.TRANSFER]: EmptyConfig;
  [AgentActionType.ESCALATE]: EscalateActionConfig;
};

export type GetActionConfig<T extends AgentActionType> = ActionConfigMap[T];
