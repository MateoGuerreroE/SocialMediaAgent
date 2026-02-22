import { Injectable } from '@nestjs/common';
import { PrismaService } from '../Prisma.service';
import { CreateClientPlatform, UpdateClientPlatform } from '../../types/transactions';
import { ClientPlatformEntity } from '../../types/entities';
import { Platform } from '../../generated/prisma/enums';

@Injectable()
export class ClientPlatformRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getByPlatformId(platformId: string): Promise<ClientPlatformEntity | null> {
    return await this.prisma.clientPlatform.findUnique({
      where: { platformId: platformId },
    });
  }

  async getAllPlatformsByPlatform(platform: Platform): Promise<ClientPlatformEntity[]> {
    return await this.prisma.clientPlatform.findMany({
      where: { platform },
      include: {
        credentials: true,
      },
    });
  }

  async getAllPlatformsByClientId(clientId: string): Promise<ClientPlatformEntity[]> {
    return await this.prisma.clientPlatform.findMany({
      where: { clientId },
    });
  }

  async getByPlatformAndClientId(
    platform: Platform,
    clientId: string,
  ): Promise<ClientPlatformEntity | null> {
    return await this.prisma.clientPlatform.findFirst({
      where: { platform, clientId },
    });
  }

  async retrievePlatformByAccount(
    platform: Platform,
    accountId: string,
  ): Promise<ClientPlatformEntity | null> {
    return await this.prisma.clientPlatform.findFirst({
      where: {
        platform,
        accountId,
      },
      include: {
        credentials: true,
      },
    });
  }

  async createClientPlatform(entity: CreateClientPlatform): Promise<ClientPlatformEntity> {
    return await this.prisma.clientPlatform.create({
      data: entity,
    });
  }

  async updateClientPlatform(updates: UpdateClientPlatform): Promise<void> {
    const { platformId, ...updateData } = updates;

    await this.prisma.clientPlatform.update({
      where: { platformId },
      data: updateData,
    });
  }
}
