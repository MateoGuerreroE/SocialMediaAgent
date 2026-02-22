import { ConsoleLogger, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

@Injectable()
export class EmailHelper {
  private transporter: nodemailer.Transporter;
  private readonly sender: string;
  constructor(
    configService: ConfigService,
    private readonly logger: ConsoleLogger,
  ) {
    const senderMail = configService.get<string>('MAIL_USER');
    if (!senderMail) {
      throw new Error('MAIL_USER is not defined in environment variables');
    }
    this.sender = senderMail;
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: configService.get<string>('MAIL_USER'),
        pass: configService.get<string>('MAIL_PASSWORD'),
      },
    });
  }

  async sendEmail({ to, subject, body }: { to: string; subject: string; body: string }) {
    this.logger.log(`Sending email to ${to}`);
    await this.transporter.sendMail({
      from: this.sender,
      to,
      subject,
      text: body,
    });
    this.logger.log(`Email sent!`);
  }
}
