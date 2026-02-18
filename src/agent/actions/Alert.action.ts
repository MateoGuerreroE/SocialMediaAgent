import { ConsoleLogger, Injectable } from '@nestjs/common';
import { AlertChannel } from '../../types/enums';
import { ClientEntity } from 'src/types/entities';

@Injectable()
export class AlertAction {
  constructor(private readonly logger: ConsoleLogger) {}

  async execute({
    clientContext,
    generatedMessage,
    alertTarget,
    alertChannel,
  }: {
    clientContext: string;
    generatedMessage: string;
    alertTarget: string;
    alertChannel: AlertChannel;
  }) {
    const body = this.resolveBodyForChannel(generatedMessage, alertChannel, clientContext);
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
    clientContext: string,
  ): Record<string, unknown> {
    switch (alertChannel) {
      case AlertChannel.EMAIL:
        return {
          subject: 'Alert from Social Media Agent',
          body: generatedMessage,
        };
      case AlertChannel.SLACK:
        return {
          text: `*Alert from Social Media Agent:*\n\n${clientContext}\nReason: ${generatedMessage}`,
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
