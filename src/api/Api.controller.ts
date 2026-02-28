import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiService } from './Api.service';
import {
  CreateClientDTO,
  CreateClientEventDTO,
  CreateCredentialDTO,
  UpdateClientDTO,
  UpdateClientEventDTO,
  UpdateCredentialDTO,
} from '../types/transactions';

@Controller('api')
export class ApiController {
  constructor(private readonly apiService: ApiService) {}
  @Post('client')
  async createClient(@Body() createClientDTO: CreateClientDTO) {
    return this.apiService.createClient(createClientDTO);
  }

  @Get('clients')
  async getAllClients() {
    return this.apiService.getAllClients();
  }

  @Get('client/:clientId')
  async retrieveClientConfig(@Param('clientId') clientId: string) {
    return this.apiService.retrieveClientConfig(clientId);
  }

  @Put('client/:clientId')
  async updateClient(@Body() updateClient: UpdateClientDTO, @Param('clientId') clientId: string) {
    return this.apiService.updateClient(updateClient, clientId);
  }

  @Put('client/event/:eventId')
  async updateEvent(@Body() updateEvent: UpdateClientEventDTO, @Param('eventId') eventId: string) {
    return this.apiService.updateClientEvent(eventId, updateEvent);
  }

  @Delete('client/event/:eventId')
  async deleteEvent(@Param('eventId') eventId: string) {
    return this.apiService.deleteEvent(eventId);
  }

  @Post('client/event')
  async createEvent(@Body() createEvent: CreateClientEventDTO) {
    return this.apiService.createEvent(createEvent);
  }

  @Post('client/credential')
  async createCredential(@Body() createCredential: CreateCredentialDTO) {
    return this.apiService.createCredential(createCredential);
  }

  @Put('client/credential/:credentialId')
  async updateCredential(
    @Body() updateCredential: UpdateCredentialDTO,
    @Param('credentialId') credentialId: string,
  ) {
    return this.apiService.updateCredential(credentialId, updateCredential);
  }

  @Delete('client/credential/:credentialId')
  async deleteCredential(@Param('credentialId') credentialId: string) {
    return this.apiService.deleteCredential(credentialId);
  }
}
