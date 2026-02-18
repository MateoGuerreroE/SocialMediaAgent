import { ConsoleLogger, Injectable } from '@nestjs/common';
import { AlertChannel } from '../../types/enums';

@Injectable()
export class AlertAction {
  constructor(private readonly logger: ConsoleLogger) {}

  async execute({
    generatedMessage,
    alertTarget,
    alertChannel,
  }: {
    generatedMessage: string;
    alertTarget: string;
    alertChannel: AlertChannel;
  }) {
    const body = this.resolveBodyForChannel(generatedMessage, alertChannel);
    this.logger.log(
      `Alerting ${alertTarget} through ${alertChannel} with message: ${JSON.stringify(body)}`,
    );

    // Alerts are hits to HTTP endpoints always as this is NOT an alerting aware system
    try {
      const result = await fetch(alertTarget, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!result.ok) {
        const error = await result.text();
        this.logger.error(
          `Failed to send alert to ${alertTarget} through ${alertChannel}: ${error}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error sending alert to ${alertTarget} through ${alertChannel}: ${
          error instanceof Error ? error.message : JSON.stringify(error)
        }`,
      );
    }
  }

  private resolveBodyForChannel(
    generatedMessage: string,
    alertChannel: AlertChannel,
  ): Record<string, unknown> {
    switch (alertChannel) {
      case AlertChannel.EMAIL:
        return {
          subject: 'Alert from Social Media Agent',
          body: generatedMessage,
        };
      case AlertChannel.SLACK:
        return {
          text: generatedMessage,
        };
      case AlertChannel.WHATSAPP:
        return {
          message: generatedMessage,
        };
      default:
        throw new Error(`Unsupported alert channel`);
    }
  }
}
