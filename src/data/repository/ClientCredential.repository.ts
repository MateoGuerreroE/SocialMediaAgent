import { Injectable } from '@nestjs/common';
import { PrismaService } from '../Prisma.service';
import { CreateCredential, UpdateCredential } from '../../types/transactions';
import { ClientCredentialEntity } from '../../types/entities';

@Injectable()
export class ClientCredentialRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createCredential(entity: CreateCredential): Promise<ClientCredentialEntity> {
    return await this.prisma.clientCredential.create({
      data: entity,
    });
  }

  async updateCredential(entity: UpdateCredential): Promise<void> {
    const { credentialId, ...updateData } = entity;
    await this.prisma.clientCredential.update({
      where: { credentialId },
      data: updateData,
    });
  }
}
