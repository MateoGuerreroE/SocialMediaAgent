import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

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
}
