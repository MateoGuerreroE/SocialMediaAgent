export type ExpectedModelResponseFormat = Array<{
  key: string;
  type: 'string' | 'number' | 'boolean';
  options?: string[];
}>;

export type SendToModelOptions = {
  prompt: string;
  systemPrompt: string;
  modelTier?: number;
  expectedFormat?: ExpectedModelResponseFormat;
};

export abstract class GenerationModel {
  abstract sendToModel(options: SendToModelOptions): Promise<string>;
}
