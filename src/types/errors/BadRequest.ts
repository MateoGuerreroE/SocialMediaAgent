import { ApplicationError } from './ApplicationError';

export class BadRequestError extends ApplicationError {
  constructor(message: string) {
    super('BAD_REQUEST', message, 400);
  }
}
