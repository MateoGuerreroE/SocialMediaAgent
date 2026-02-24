import { Injectable } from '@nestjs/common';
import { PrismaService } from '../Prisma.service';
import { ClientEntity } from '../../types/entities';
import { CreateClient, UpdateClientPayload } from '../../types/transactions';

@Injectable()
export class ClientRepository {
  constructor(private readonly prisma: PrismaService) {}

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
        agents: includeRelations,
        credentials: includeRelations,
      },
    }) as Promise<ClientEntity | null>;
  }
}
