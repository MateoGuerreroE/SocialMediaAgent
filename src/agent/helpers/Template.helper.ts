import { ExternalApiCallTemplate } from '../../types/nested';

type DateModifier = 'date' | 'time';

export class TemplateHelper {
  // Captures: key (group 1) and optional modifier after | (group 2)
  // Matches {{key}}, {{key|date}}, {{key|time}}
  private static placeholderRegex = /\{\{\s*(\w+)\s*(?:\|\s*(\w+)\s*)?\}\}/g;

  static getTemplateBody(
    template: ExternalApiCallTemplate,
    values: Array<{ key: string; value: any }>,
  ): string {
    const isUrlParams = template.method === 'GET';
    return template.payload.replace(
      this.placeholderRegex,
      (_, placeholderKey: string, modifier?: string) => {
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

        // Coerce to declared type, then apply optional modifier
        let coerced = TemplateHelper.coerceValue(rawValue, mapping.type, rawKey);
        if (modifier) {
          coerced = TemplateHelper.applyModifier(
            coerced as string,
            modifier as DateModifier,
            mapping.type,
            placeholderKey,
          );
        }

        // GET (URL params): plain URI-encoded string — no JSON quotes around strings/dates.
        // POST (JSON body): JSON.stringify so numbers stay numeric and strings are quoted.
        return isUrlParams ? encodeURIComponent(String(coerced)) : JSON.stringify(coerced);
      },
    );
  }

  /**
   * Applies a format modifier to a coerced date ISO string.
   * - |date  → "YYYY-MM-DD"   e.g. "2026-03-06"
   * - |time  → "HH:MM"        e.g. "13:00"
   */
  private static applyModifier(
    value: string,
    modifier: DateModifier,
    type: string,
    key: string,
  ): string {
    if (type !== 'date') {
      throw new Error(
        `Modifier "|${modifier}" is only supported on fields of type "date" (field: "${key}").`,
      );
    }
    // Value is already a valid ISO 8601 string from coerceValue
    switch (modifier) {
      case 'date':
        return value.slice(0, 10); // "2026-03-06"
      case 'time':
        return value.slice(11, 16); // "13:00"
      default:
        throw new Error(`Unknown modifier "|${modifier}" on field "${key}".`);
    }
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
