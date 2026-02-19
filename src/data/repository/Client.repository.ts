import { Injectable } from '@nestjs/common';
import { PrismaService } from '../Prisma.service';
import { ClientEntity } from '../../types/entities';
import { CredentialType, Platform } from '../../generated/prisma/enums';
import { CreateClient, UpdateClientPayload } from '../../types/transactions';

@Injectable()
export class ClientRepository {
  constructor(private readonly prisma: PrismaService) {}

  async locateClientByAccount(platform: Platform, accountId: string): Promise<ClientEntity | null> {
    return this.prisma.client.findFirst({
      where: {
        ...(platform === Platform.INSTAGRAM && { instagramAccountId: accountId }),
        ...(platform === Platform.FACEBOOK && { facebookAccountId: accountId }),
      },
      include: {
        events: true,
        credentials: true,
        agents: {
          include: {
            policies: true,
          },
        },
      },
    });
  }

  async createClient(clientData: CreateClient): Promise<ClientEntity> {
    return this.prisma.client.create({
      data: clientData,
    });
  }

  async getClientByBusinessName(businessName: string): Promise<ClientEntity | null> {
    return this.prisma.client.findFirst({
      where: { businessName },
    });
  }

  async updateClient(data: UpdateClientPayload): Promise<{ clientId: string }> {
    const { clientId, ...updateData } = data;
    const result = await this.prisma.client.update({
      select: { clientId: true },
      where: { clientId },
      data: updateData,
    });

    return { clientId: result.clientId };
  }

  async getClientById(
    clientId: string,
    includeRelations: boolean = false,
  ): Promise<ClientEntity | null> {
    return this.prisma.client.findUnique({
      where: { clientId },
      include: {
        events: includeRelations,
        credentials: includeRelations,
      },
    });
  }

  async getClientsWithWhatsappNumber(): Promise<ClientEntity[]> {
    return this.prisma.client.findMany({
      where: {
        whatsappNumber: {
          not: null,
        },
      },
      include: {
        credentials: {
          where: {
            type: CredentialType.WHATSAPP_S3_BUCKET,
          },
        },
      },
    });
  }
}
