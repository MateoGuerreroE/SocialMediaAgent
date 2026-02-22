import { ConsoleLogger, Injectable } from '@nestjs/common';
import { AlertChannel } from '../../types/enums';
import { EmailHelper } from '../helpers/Email.helper';

@Injectable()
export class AlertAction {
  constructor(
    private readonly logger: ConsoleLogger,
    private readonly emailHelper: EmailHelper,
  ) {}

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
    this.logger.log(`Alerting ${alertTarget} through ${alertChannel}`);

    switch (alertChannel) {
      case AlertChannel.EMAIL: {
        try {
          await this.emailHelper.sendEmail({
            to: alertTarget,
            subject: 'Alert from Social Media Agent',
            body: `Client Context:\n${clientContext}\n\nReason:\n${generatedMessage}`,
          });
        } catch (error) {
          this.logger.error(
            `Error sending email alert to ${alertTarget}: ${
              error instanceof Error ? error.message : JSON.stringify(error)
            }`,
          );
        }
        break;
      }
      default: {
        const body = this.resolveBodyForChannel(generatedMessage, alertChannel, clientContext);
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
    }
  }

  private resolveBodyForChannel(
    generatedMessage: string,
    alertChannel: AlertChannel,
    clientContext: string,
  ): Record<string, unknown> {
    switch (alertChannel) {
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
