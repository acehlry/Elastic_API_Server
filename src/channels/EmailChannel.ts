import nodemailer from 'nodemailer';
import { NotificationChannel } from '../types/notification.types';
import logger from '../config/logger';

export class EmailChannel implements NotificationChannel {
  readonly type = 'email';

  private readonly from:   string;
  private readonly host:   string;
  private readonly port:   number;
  private readonly user:   string;
  private readonly pass:   string;
  private readonly secure: boolean;

  constructor() {
    this.host   = process.env.SMTP_HOST   || '';
    this.port   = parseInt(process.env.SMTP_PORT || '587');
    this.user   = process.env.SMTP_USER   || '';
    this.pass   = process.env.SMTP_PASS   || '';
    this.from   = process.env.SMTP_FROM   || this.user;
    this.secure = process.env.SMTP_SECURE === 'true';
  }

  isConfigured(): boolean {
    return !!(this.host && this.user && this.pass);
  }

  async send(message: string, targets: string[]): Promise<void> {
    if (!this.isConfigured()) {
      logger.warn('[Email] 설정 미완료 — 수신자:', targets.join(', '));
      logger.warn('[Email] 메시지:', message);
      return;
    }

    const transporter = nodemailer.createTransport({
      host:   this.host,
      port:   this.port,
      secure: this.secure,
      auth:   { user: this.user, pass: this.pass },
    });

    try {
      const info = await transporter.sendMail({
        from:    this.from,
        to:      targets.join(', '),
        subject: this.buildSubject(message),
        text:    message,
      });
      logger.info(`[Email] 발송 성공: ${info.messageId} → ${targets.join(', ')}`);
    } catch (error) {
      logger.error('[Email] 발송 오류:', error);
    }
  }

  private buildSubject(message: string): string {
    const first = message.split('\n')[0];
    return first.length > 80 ? first.slice(0, 80) + '...' : first;
  }
}

export default new EmailChannel();
