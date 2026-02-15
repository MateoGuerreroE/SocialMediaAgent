import { CredentialType } from '../generated/prisma/enums';

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
