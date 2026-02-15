import { Injectable } from '@nestjs/common';
import { PrismaService } from '../Prisma.service';
import { CreateClientEvent, UpdateClientEvent } from '../../types/transactions';
import { ClientEventEntity } from '../../types/entities';

@Injectable()
export class ClientEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getEventById(eventId: string): Promise<ClientEventEntity | null> {
    return this.prisma.clientEvent.findUnique({
      where: { eventId },
    });
  }

  async createEvent(payload: CreateClientEvent): Promise<ClientEventEntity> {
    return this.prisma.clientEvent.create({
      data: payload,
    });
  }

  async updateEvent(updates: UpdateClientEvent): Promise<void> {
    const { clientEventId, ...updateData } = updates;
    await this.prisma.clientEvent.update({
      where: { eventId: clientEventId },
      data: updateData,
    });
  }
}
