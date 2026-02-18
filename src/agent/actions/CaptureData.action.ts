import { ConsoleLogger, Injectable } from '@nestjs/common';
import { RequiredField, RetrievedField } from '../types';
import { ConversationMessageEntity } from 'src/types/entities';
import { GenerativeService } from 'src/generation';

@Injectable()
export class CaptureDataAction {
  constructor(
    private readonly logger: ConsoleLogger,
    private readonly generationService: GenerativeService,
  ) {}
  // Reusable action to capture data from a required fields and return it in a structured format.
  // Resolution of required fields is handled by the orchestration layer, which will coordinate pushbacks, etc.
  async execute({
    requiredFields,
    messages,
  }: {
    requiredFields: RequiredField[];
    messages: ConversationMessageEntity[];
  }): Promise<{ retrieved: RetrievedField[]; missing: RequiredField[] }> {
    if (requiredFields.length === 0) {
      this.logger.warn('No required fields provided for CaptureDataAction.');
      return { retrieved: [], missing: requiredFields };
    }

    const retrievedFields: RetrievedField[] =
      await this.generationService.extractFieldsFromResponse(requiredFields, messages);

    const validFields: RetrievedField[] = [];
    for (const field of retrievedFields) {
      if (field.value === '' || field.value === null || field.value === undefined) {
        this.logger.debug(`Field "${field.key}" has an empty value. Skipping this field.`);
        continue;
      }
      const requiredField = requiredFields.find((f) => f.key === field.key);
      if (!requiredField) {
        this.logger.warn(
          `Received field with key "${field.key}" which is not in the list of required fields.`,
        );
        continue;
      }
      if (field.confidence > 0.5) {
        const valid = requiredField.validationRegex
          ? new RegExp(requiredField.validationRegex).test(field.value)
          : true;
        if (valid) {
          validFields.push(field);
        } else {
          this.logger.warn(
            `Field "${field.key}" with value "${field.value}" did not pass validation regex.`,
          );
        }
      }
    }

    const missingFields = requiredFields.filter(
      (reqField) => !validFields.some((retrieved) => retrieved.key === reqField.key),
    );

    return { retrieved: validFields, missing: missingFields };
  }
}
