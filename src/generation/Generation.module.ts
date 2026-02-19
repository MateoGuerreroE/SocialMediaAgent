import { Module } from '@nestjs/common';
import { PromptService } from './Prompt.service';
import { GenerationService } from './Generation.service';
import { GenerationModel } from './models/model';
import { GeminiModel } from './models/Gemini.model';

@Module({
  providers: [
    PromptService,
    GenerationService,
    { provide: GenerationModel, useClass: GeminiModel },
  ],
  exports: [GenerationService],
})
export class GenerationModule {}
