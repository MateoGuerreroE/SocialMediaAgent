import { ApplicationError } from './ApplicationError';

export class KnownUnhandledMessageError extends ApplicationError {
  constructor(message: string) {
    super('KNOWN_UNHANDLED_MESSAGE', message, 400);
  }
}
