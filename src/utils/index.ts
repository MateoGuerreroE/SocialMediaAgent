import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import merge from 'deepmerge';
import { CredentialType, Platform, PlatformChannel } from 'src/generated/prisma/enums';
import { RequiredField, RetrievedField } from '../agent/types';
import { AgentEntity } from 'src/types/entities';
import { ConsoleLogger } from '@nestjs/common';

dayjs.extend(utc);
dayjs.extend(timezone);

export class Utils {
  static sleep(delayMs: number) {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  static generateUUID() {
    return crypto.randomUUID();
  }

  static getMessageDate(date: Date): string {
    const now = dayjs().tz('America/New_York');
    const target = dayjs(date).tz('America/New_York');

    if (now.isSame(target, 'day')) {
      return `Today, ${target.format('dddd')} at ${target.format('h:mm A')}`;
    }

    if (now.subtract(1, 'day').isSame(target, 'day')) {
      return `Yesterday, ${target.format('dddd')} at ${target.format('h:mm A')}`;
    }

    const diffDays = now.diff(target, 'day');
    return `${diffDays} days ago at ${target.format('h:mm A')}`;
  }

  static mergeAgentConfigurations({
    agent,
    channel,
    platform,
    logger,
  }: {
    agent: AgentEntity;
    channel: PlatformChannel;
    platform: Platform;
    logger: ConsoleLogger;
  }): void {
    const variants = agent.variants || [];
    if (variants.length) {
      const originalConfig = agent.configuration || {};
      const matchVariant = variants.find(
        (v) =>
          (v.platform === null || v.platform === platform) &&
          (v.channel === null || v.channel === channel),
      );

      if (matchVariant && matchVariant.isActive) {
        logger.log(
          `Found matching variant ${matchVariant.variantId} for agent ${agent.agentId}. Merging configurations.`,
        );
        // In case variant overrides any of the agent configurations
        if (matchVariant.overrideConfiguration)
          agent.configuration = merge(originalConfig, matchVariant.overrideConfiguration, {
            arrayMerge: (_, sourceArray) => sourceArray, // Override arrays instead of merging
          });
      }
    }
  }

  static resolveRequiredCredential(platform: Platform, channel: PlatformChannel): CredentialType {
    if (platform === Platform.WHATSAPP) {
      return CredentialType.WHATSAPP_BUCKET;
    } else if (platform === Platform.INSTAGRAM && channel === PlatformChannel.DIRECT_MESSAGE) {
      return CredentialType.APP_TOKEN;
    } else {
      return CredentialType.PAGE_TOKEN;
    }
  }

  static filterRequiredFields(
    reqFields: RequiredField[],
    receivedFields: RetrievedField[],
  ): RequiredField[] {
    return reqFields.filter((req) => !receivedFields.some((rec) => rec.key === req.key));
  }

  static parseModelResponse<T>(
    response: string,
    expectedFormat: Array<{
      key: string;
      type: 'string' | 'number' | 'boolean';
      options?: string[];
    }>,
    isArray: boolean = false,
  ): T {
    let parsed: unknown;
    try {
      parsed = JSON.parse(response.trim());
    } catch (error) {
      throw new Error(
        `Failed to parse model response as JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Model response must be a JSON object or array.');
    }

    // Handle array responses - check both 'values' and 'value' for compatibility
    if (isArray) {
      const val = parsed['values'] || parsed['value'];
      if (!Array.isArray(val)) {
        throw new Error(
          'Model response must contain a "values" or "value" array when isArray is true.',
        );
      }

      // Validate each item in the array
      val.forEach((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          throw new Error(`Array item at index ${index} must be a JSON object.`);
        }
        Utils.validateObject(
          item as Record<string, unknown>,
          expectedFormat,
          `Array item at index ${index}`,
        );
      });

      return val as T;
    }

    // Handle single object responses
    if (Array.isArray(parsed)) {
      throw new Error('Model response must be a JSON object when isArray is false.');
    }

    Utils.validateObject(parsed as Record<string, unknown>, expectedFormat, 'Model response');
    return parsed as T;
  }

  static validateObject(
    obj: Record<string, unknown>,
    expectedFormat: Array<{
      key: string;
      type: 'string' | 'number' | 'boolean';
      options?: string[];
    }>,
    context: string = 'Object',
  ): void {
    for (const field of expectedFormat) {
      if (!(field.key in obj)) {
        throw new Error(`${context} is missing expected field: ${field.key}`);
      }
      const value = obj[field.key];
      switch (field.type) {
        case 'string':
          if (typeof value !== 'string') {
            throw new Error(`${context} field ${field.key} is expected to be a string.`);
          }
          if (field.options && !field.options.includes(value)) {
            throw new Error(
              `${context} field ${field.key} has an invalid value. Expected one of: ${field.options.join(', ')}`,
            );
          }
          break;
        case 'number':
          if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
            throw new Error(`${context} field ${field.key} is expected to be a number.`);
          }
          break;
        case 'boolean':
          if (typeof value !== 'boolean') {
            throw new Error(`${context} field ${field.key} is expected to be a boolean.`);
          }
          break;
        default:
          throw new Error(`Unsupported field type: ${field.type as string}`);
      }
    }
  }
}
