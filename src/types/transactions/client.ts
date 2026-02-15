import {
  IsString,
  IsNotEmpty,
  MinLength,
  IsOptional,
  IsEnum,
  IsDateString,
  IsUUID,
  IsBoolean,
} from 'class-validator';
import { CredentialType } from '../../generated/prisma/enums';

export class CreateClientDTO {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  businessName: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  businessLocation: string;

  @IsString()
  @IsNotEmpty()
  industry: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(12)
  businessDescription: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  businessHours: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  contactOptions: string;

  @IsString()
  @IsOptional()
  dynamicInformation?: string;

  @IsString()
  @IsOptional()
  instagramAccountId?: string;

  @IsString()
  @IsOptional()
  facebookAccountId?: string;

  @IsString()
  @IsOptional()
  whatsappNumber?: string;
}

export interface CreateClient extends CreateClientDTO {
  isActive: boolean;
  clientId: string;
}

export class UpdateClientDTO {
  @IsOptional()
  @IsString()
  @MinLength(3)
  businessName?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsString()
  @IsOptional()
  @MinLength(5)
  businessLocation?: string;

  @IsString()
  @IsOptional()
  industry?: string;

  @IsString()
  @IsOptional()
  @MinLength(12)
  businessDescription?: string;

  @IsString()
  @IsOptional()
  @MinLength(3)
  businessHours?: string;

  @IsString()
  @IsOptional()
  @MinLength(5)
  contactOptions?: string;

  @IsString()
  @IsOptional()
  dynamicInformation?: string;

  @IsString()
  @IsOptional()
  instagramAccountId?: string;

  @IsString()
  @IsOptional()
  facebookAccountId?: string;

  @IsString()
  @IsOptional()
  whatsappNumber?: string;
}

export interface UpdateClientPayload extends UpdateClientDTO {
  clientId: string;
}

export class CreateCredentialsDTO {
  @IsString()
  @IsNotEmpty()
  @IsEnum(['PAGE_ACCESS_TOKEN', 'APP_ACCESS_TOKEN', 'WHATSAPP_S3_BUCKET'])
  type: CredentialType;

  @IsString()
  @IsNotEmpty()
  value: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export interface CreateCredential extends CreateCredentialsDTO {
  clientId: string;
  clientCredentialId: string;
}

export class UpdateCredentialDTO {
  @IsOptional()
  @IsEnum(['PAGE_ACCESS_TOKEN', 'APP_ACCESS_TOKEN', 'WHATSAPP_S3_BUCKET'])
  type?: CredentialType;

  @IsString()
  @IsOptional()
  value?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export interface UpdateCredential extends UpdateCredentialDTO {
  credentialId: string;
}

export class CreateClientEventDTO {
  @IsUUID()
  @IsNotEmpty()
  clientId: string;

  @IsString()
  @IsNotEmpty()
  eventName: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  description: string;

  @IsString()
  @IsNotEmpty()
  recurrence: string;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;
}

export interface CreateClientEvent extends CreateClientEventDTO {
  clientEventId: string;
}

export class UpdateClientEventDTO {
  @IsString()
  @IsOptional()
  eventName?: string;

  @IsString()
  @IsOptional()
  @MinLength(10)
  description?: string;

  @IsString()
  @IsOptional()
  recurrence?: string;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;
}

export interface UpdateClientEvent extends UpdateClientEventDTO {
  clientEventId: string;
}
