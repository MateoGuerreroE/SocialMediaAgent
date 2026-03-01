import { ExternalApiCallTemplate } from '../../types/nested';

export class TemplateHelper {
  private static placeholderRegex = /\{\{\s*(\w+)\s*\}\}/g;

  static getTemplateBody(
    template: ExternalApiCallTemplate,
    values: Array<{ key: string; value: any }>,
  ): string {
    return template.body.replace(this.placeholderRegex, (_, placeholderKey: string) => {
      // Find the raw key that maps to this placeholder key
      const rawKey = Object.entries(template.variablesMapping).find(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        ([_, mappedKey]) => mappedKey === placeholderKey,
      )?.[0];

      if (!rawKey) {
        throw new Error(
          `No mapping found for placeholder "${placeholderKey}" in variablesMapping.`,
        );
      }

      // Find the value using the raw key
      const value = values.find((v) => v.key === rawKey)?.value;
      if (value === undefined) {
        throw new Error(
          `Value for raw key "${rawKey}" (mapped to "${placeholderKey}") not found in values.`,
        );
      }

      return JSON.stringify(value);
    });
  }
}
