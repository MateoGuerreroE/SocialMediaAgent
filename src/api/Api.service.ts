import { Injectable } from '@nestjs/common';
import { ClientService } from '../client';
import { CreateClientDTO, UpdateClientDTO } from '../types/transactions';
import { ApiResponse } from './types';
import { ApplicationError } from '../types/errors/ApplicationError';
import { BadRequestError } from '../types/errors';

@Injectable()
export class ApiService {
  constructor(private readonly clientService: ClientService) {}

  async createClient(receivedDTO: CreateClientDTO): Promise<ApiResponse<{ clientId: string }>> {
    try {
      const client = await this.clientService.createClient(receivedDTO);
      return { success: true, data: { clientId: client.clientId } };
    } catch (e) {
      if (e instanceof ApplicationError) {
        return { success: false, error: e.message };
      }
      console.error('Unexpected error in createClient:', e);
      return { success: false, error: 'An unexpected error occurred while creating the client.' };
    }
  }

  async updateClient(
    receivedDTO: UpdateClientDTO,
    clientId: string,
  ): Promise<ApiResponse<{ clientId: string }>> {
    try {
      const validUpdates = Object.values(receivedDTO).filter((value) => value !== undefined);
      if (validUpdates.length === 0) {
        throw new BadRequestError('No updates provided for client.');
      }
      await this.clientService.updateClientInformation({ ...validUpdates, clientId });
      return { success: true, data: { clientId } };
    } catch (e) {
      if (e instanceof ApplicationError) {
        return { success: false, error: e.message };
      }
      console.error('Unexpected error in updateClient:', e);
      return { success: false, error: 'An unexpected error occurred while updating the client.' };
    }
  }
}
