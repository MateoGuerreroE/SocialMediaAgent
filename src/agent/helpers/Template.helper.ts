import { ExternalApiCallTemplate } from '../../types/nested';

export class TemplateHelper {
  private static placeholderRegex = /\{\{\s*(\w+)\s*\}\}/g;

  static getTemplateBody(
    template: ExternalApiCallTemplate,
    values: Array<{ key: string; value: any }>,
  ): string {
    const isUrlParams = template.method === 'GET';
    return template.payload.replace(this.placeholderRegex, (_, placeholderKey: string) => {
      // Find the raw key + type mapping for this placeholder
      const [rawKey, mapping] =
        Object.entries(template.variablesMapping).find(
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          ([_, m]) => m.key === placeholderKey,
        ) ?? [];

      if (!rawKey || !mapping) {
        throw new Error(
          `No mapping found for placeholder "${placeholderKey}" in variablesMapping.`,
        );
      }

      // Find the raw string value using the raw key
      const rawValue: string = values.find((v) => v.key === rawKey)?.value;
      if (rawValue === undefined) {
        throw new Error(
          `Value for raw key "${rawKey}" (mapped to "${placeholderKey}") not found in values.`,
        );
      }

      // Coerce the value to the declared type before serialising.
      // GET (URL params): plain URI-encoded string — no JSON quotes around strings/dates.
      // POST (JSON body): JSON.stringify so numbers stay numeric and strings are quoted.
      const coerced = TemplateHelper.coerceValue(rawValue, mapping.type, rawKey);
      return isUrlParams ? encodeURIComponent(String(coerced)) : JSON.stringify(coerced);
    });
  }

  private static coerceValue(
    raw: string,
    type: 'string' | 'number' | 'boolean' | 'date',
    key: string,
  ): string | number | boolean {
    switch (type) {
      case 'number': {
        const n = Number(raw);
        if (isNaN(n)) {
          throw new Error(`Cannot convert value "${raw}" for key "${key}" to number.`);
        }
        return n;
      }
      case 'boolean':
        return typeof raw === 'boolean' ? raw : raw === 'true' || raw === '1' || raw === 'yes';
      case 'date': {
        const d = new Date(raw);
        if (isNaN(d.getTime())) {
          throw new Error(`Cannot convert value "${raw}" for key "${key}" to a valid date.`);
        }
        return d.toISOString();
      }
      case 'string':
      default:
        return raw;
    }
  }
}
