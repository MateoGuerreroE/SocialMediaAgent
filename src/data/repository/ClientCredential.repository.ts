import { Injectable } from '@nestjs/common';
import { PrismaService } from '../Prisma.service';
import { CreateCredential, UpdateCredential } from '../../types/transactions';
import { ClientCredentialEntity } from '../../types/entities';

@Injectable()
export class ClientCredentialRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getCredentialById(credentialId: string): Promise<ClientCredentialEntity | null> {
    return await this.prisma.clientCredential.findUnique({
      where: { credentialId },
    });
  }

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

  async deleteCredential(credentialId: string): Promise<void> {
    await this.prisma.clientCredential.delete({
      where: { credentialId },
    });
  }
}
