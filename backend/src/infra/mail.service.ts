import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Outgoing e-mail through SMTP (MAIL_HOST / MAIL_PORT / MAIL_USER / MAIL_PASS / MAIL_FROM).
 * Without MAIL_HOST, messages are only written to the log (development).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  private readonly transporter: Transporter | null;
  private readonly from = process.env.MAIL_FROM || 'School ERP <no-reply@school-erp.local>';

  constructor() {
    const host = process.env.MAIL_HOST;
    this.transporter = host
      ? nodemailer.createTransport({
          host,
          port: Number(process.env.MAIL_PORT || 587),
          secure: process.env.MAIL_SECURE === 'true',
          auth: process.env.MAIL_USER ? { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS } : undefined,
        })
      : null;
  }

  get enabled() {
    return !!this.transporter;
  }

  async send(message: MailMessage): Promise<boolean> {
    if (!this.transporter) {
      this.logger.log(`(not sent, MAIL_HOST unset) to=${message.to} subject="${message.subject}"`);
      return false;
    }
    try {
      await this.transporter.sendMail({ from: this.from, ...message });
      return true;
    } catch (err) {
      this.logger.error(`Sending to ${message.to} failed: ${(err as Error).message}`);
      return false;
    }
  }
}
