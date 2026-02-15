import { HttpStatus } from '@nestjs/common';
import { ApplicationError } from './ApplicationError';

export class NotFoundError extends ApplicationError {
  constructor(entity: string, id?: string, message?: string) {
    super(
      'NOT_FOUND',
      message ?? `${entity} not found${id ? ` with ID: ${id}` : ''}.`,
      HttpStatus.NOT_FOUND,
    );
  }
}
