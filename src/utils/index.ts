import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import merge from 'deepmerge';
import { CredentialType, Platform, PlatformChannel } from 'src/generated/prisma/enums';
import { RequiredField, RetrievedField } from '../agent/types';
import { ClientEntity } from 'src/types/entities';

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

  static mergeConfigurationOverrides<T, K extends Partial<T>>(configuration: T, override: K): T {
    return merge(configuration, override); // Check how useful is for us to have null removing original config values.
  }

  static resolveRequiredCredential(platform: Platform, channel: PlatformChannel): CredentialType {
    if (platform === Platform.WHATSAPP) {
      return CredentialType.WHATSAPP_S3_BUCKET;
    } else if (platform === Platform.INSTAGRAM && channel === PlatformChannel.DIRECT_MESSAGE) {
      return CredentialType.APP_ACCESS_TOKEN;
    } else {
      return CredentialType.PAGE_ACCESS_TOKEN;
    }
  }

  static filterRequiredFields(
    reqFields: RequiredField[],
    receivedFields: RetrievedField[],
  ): RequiredField[] {
    return reqFields.filter((req) => !receivedFields.some((rec) => rec.key === req.key));
  }
}
