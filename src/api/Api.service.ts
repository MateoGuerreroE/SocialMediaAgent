import { Injectable } from '@nestjs/common';
import { ClientService } from '../client';
import {
  CreateClientDTO,
  CreateClientEventDTO,
  CreateCredentialDTO,
  UpdateClientDTO,
  UpdateClientEventDTO,
  UpdateCredentialDTO,
} from '../types/transactions';
import { ApiResponse } from './types';
import { ApplicationError } from '../types/errors/ApplicationError';
import { BadRequestError } from '../types/errors';
import { ClientEntity } from 'src/types/entities';

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
      const validUpdates = Object.fromEntries(
        Object.entries(receivedDTO).filter(([_, value]) => value !== undefined),
      );
      if (Object.keys(validUpdates).length === 0) {
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

  async getAllClients(): Promise<ApiResponse<ClientEntity[]>> {
    try {
      const clients = await this.clientService.getAllClients();
      return { success: true, data: clients };
    } catch (e) {
      if (e instanceof ApplicationError) {
        return { success: false, error: e.message };
      }
      console.error('Unexpected error in getAllClients:', e);
      return {
        success: false,
        error: 'An unexpected error occurred while retrieving all clients.',
      };
    }
  }

  async retrieveClientConfig(clientId: string): Promise<ApiResponse<ClientEntity>> {
    try {
      const client = await this.clientService.getCompleteClientById(clientId);

      return { success: true, data: client };
    } catch (e) {
      if (e instanceof ApplicationError) {
        return { success: false, error: e.message };
      }
      console.error('Unexpected error in retrieveClientConfig:', e);
      return {
        success: false,
        error: 'An unexpected error occurred while retrieving the client configuration.',
      };
    }
  }

  async updateClientEvent(
    eventId: string,
    updates: UpdateClientEventDTO,
  ): Promise<ApiResponse<{ clientEventId: string }>> {
    try {
      await this.clientService.updateClientEvent(eventId, updates);
      return { success: true, data: { clientEventId: eventId } };
    } catch (e) {
      if (e instanceof ApplicationError) {
        return { success: false, error: e.message };
      }
      console.error('Unexpected error in updateClientEvent:', e);
      return {
        success: false,
        error: 'An unexpected error occurred while updating the client event.',
      };
    }
  }

  async deleteEvent(eventId: string): Promise<ApiResponse<string>> {
    try {
      await this.clientService.deleteEvent(eventId);
      return { success: true, data: 'Deleted' };
    } catch (e) {
      if (e instanceof ApplicationError) {
        return { success: false, error: e.message };
      }
      console.error('Unexpected error in deleteEvent:', e);
      return {
        success: false,
        error: 'An unexpected error occurred while deleting the client event.',
      };
    }
  }

  async createEvent(
    createEvent: CreateClientEventDTO,
  ): Promise<ApiResponse<{ clientEventId: string }>> {
    try {
      const event = await this.clientService.createClientEvent(createEvent.clientId, createEvent);
      return { success: true, data: { clientEventId: event.eventId } };
    } catch (e) {
      if (e instanceof ApplicationError) {
        return { success: false, error: e.message };
      }
      console.error('Unexpected error in createEvent:', e);
      return {
        success: false,
        error: 'An unexpected error occurred while creating the client event.',
      };
    }
  }

  async updateCredential(
    credentialId: string,
    updates: UpdateCredentialDTO,
  ): Promise<ApiResponse<{ credentialId: string }>> {
    try {
      await this.clientService.updateClientCredential(credentialId, updates);
      return { success: true, data: { credentialId } };
    } catch (e) {
      if (e instanceof ApplicationError) {
        return { success: false, error: e.message };
      }
      console.error('Unexpected error in updateCredential:', e);
      return {
        success: false,
        error: 'An unexpected error occurred while updating the client credential.',
      };
    }
  }

  async createCredential(
    createCredential: CreateCredentialDTO,
  ): Promise<ApiResponse<{ credentialId: string }>> {
    try {
      const credential = await this.clientService.createClientCredential(createCredential);
      return { success: true, data: { credentialId: credential.credentialId } };
    } catch (e) {
      if (e instanceof ApplicationError) {
        return { success: false, error: e.message };
      }
      console.error('Unexpected error in createCredential:', e);
      return {
        success: false,
        error: 'An unexpected error occurred while creating the client credential.',
      };
    }
  }

  async deleteCredential(credentialId: string): Promise<ApiResponse<string>> {
    try {
      await this.clientService.deleteCredential(credentialId);
      return { success: true, data: 'Deleted' };
    } catch (e) {
      if (e instanceof ApplicationError) {
        return { success: false, error: e.message };
      }
      console.error('Unexpected error in deleteCredential:', e);
      return {
        success: false,
        error: 'An unexpected error occurred while deleting the client credential.',
      };
    }
  }
}
