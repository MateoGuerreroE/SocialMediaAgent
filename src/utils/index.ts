export class Utils {
  static sleep(delayMs: number) {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  static generateUUID() {
    return crypto.randomUUID();
  }
}
