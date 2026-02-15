import { Body, Controller, Param, Post, Put } from '@nestjs/common';
import { ApiService } from './Api.service';
import { CreateClientDTO, UpdateClientDTO } from '../types/transactions';

@Controller('api')
export class ApiController {
  constructor(private readonly apiService: ApiService) {}
  @Post('client')
  async createClient(@Body() createClientDTO: CreateClientDTO) {
    return this.apiService.createClient(createClientDTO);
  }

  @Put('client/:clientId')
  async updateClient(@Body() updateClient: UpdateClientDTO, @Param('clientId') clientId: string) {
    return this.apiService.updateClient(updateClient, clientId);
  }
}
