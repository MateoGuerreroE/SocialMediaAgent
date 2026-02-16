import { Module } from '@nestjs/common';
import { PromptService } from './Prompt.service';
import { GenerativeService } from './Generative.service';
import { GenerationModel } from './models/model';
import { GeminiModel } from './models/Gemini.model';

@Module({
  providers: [
    PromptService,
    GenerativeService,
    { provide: GenerationModel, useClass: GeminiModel },
  ],
  exports: [GenerativeService],
})
export class GenerationModule {}
