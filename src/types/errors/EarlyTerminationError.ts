import { ApplicationError } from './ApplicationError';

export class EarlyTerminationError extends ApplicationError {
  constructor(message: string) {
    super('EARLY_TERMINATION', message, 400);
  }
}
