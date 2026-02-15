import { Module, Global, ConsoleLogger } from '@nestjs/common';

@Global()
@Module({
  providers: [ConsoleLogger],
  exports: [ConsoleLogger],
})
export class LoggingModule {}
