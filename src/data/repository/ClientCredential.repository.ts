import { Injectable } from '@nestjs/common';
import { PrismaService } from '../Prisma.service';
import { CreateCredential, UpdateCredential } from '../../types/transactions';
import { ClientCredentialEntity } from '../../types/entities';

@Injectable()
export class ClientCredentialRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getByCredentialId(credentialId: string): Promise<ClientCredentialEntity | null> {
    return this.prisma.clientCredential.findUnique({
      where: { clientCredentialId: credentialId },
    });
  }

  async createCredentials(entity: CreateCredential): Promise<ClientCredentialEntity> {
    return this.prisma.clientCredential.create({
      data: entity,
    });
  }

  async updateCredential(updates: UpdateCredential): Promise<void> {
    const { credentialId, ...updateData } = updates;

    await this.prisma.clientCredential.update({
      where: { clientCredentialId: credentialId },
      data: updateData,
    });
  }
}
