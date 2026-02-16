import { Injectable } from '@nestjs/common';
import { ExpectedModelResponseFormat, GenerationModel, SendToModelOptions } from './model';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GeminiModel implements GenerationModel {
  private typeMapper = {
    string: SchemaType.STRING,
    number: SchemaType.NUMBER,
    boolean: SchemaType.BOOLEAN,
  };
  private geminiClient: GoogleGenerativeAI;
  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('Invalid Generative Model API KEY');
    }
    this.geminiClient = new GoogleGenerativeAI(apiKey);
  }

  async sendToModel({
    prompt,
    systemPrompt,
    modelTier = 1,
    expectedFormat,
  }: SendToModelOptions): Promise<string> {
    let format;
    if (expectedFormat) {
      format = this.parseFormat(expectedFormat);
    }

    const model = this.geminiClient.getGenerativeModel({
      model: this.resolveModelName(modelTier),
      systemInstruction: systemPrompt,
      generationConfig: {
        responseMimeType: format ? 'application/json' : 'text/plain',
        ...(format ? { responseSchema: { type: SchemaType.OBJECT, properties: format } } : {}),
      },
    });

    const result = await model.generateContent(prompt);
    return result.response.text();
  }

  private parseFormat(format: ExpectedModelResponseFormat) {
    return format.reduce(
      (acc, item) => ({
        ...acc,
        [item.key]: {
          type: this.typeMapper[item.type],
          ...(item.options ? { enum: item.options, format: 'enum' } : {}),
        },
      }),
      {},
    );
  }

  private resolveModelName(modelTier: number): string {
    switch (modelTier) {
      case 1:
        return 'gemini-2.5-flash';
      case 2:
        return 'gemini-3-pro-preview';
      default:
        return 'gemini-2.5-flash';
    }
  }
}
