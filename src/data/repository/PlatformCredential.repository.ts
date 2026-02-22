import { Injectable } from '@nestjs/common';
import { PrismaService } from '../Prisma.service';
import { CreateCredential, UpdateCredential } from '../../types/transactions';
import { PlatformCredentialEntity } from '../../types/entities';

@Injectable()
export class PlatformCredentialRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createCredential(entity: CreateCredential): Promise<PlatformCredentialEntity> {
    return await this.prisma.platformCredential.create({
      data: entity,
    });
  }

  async updateCredential(entity: UpdateCredential): Promise<void> {
    const { credentialId, ...updateData } = entity;
    await this.prisma.platformCredential.update({
      where: { credentialId },
      data: updateData,
    });
  }
}
