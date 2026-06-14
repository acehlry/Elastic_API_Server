import crypto from 'crypto';
import { NotificationChannel } from '../types/notification.types';
import logger from '../config/logger';

const SOLAPI_URL = 'https://api.solapi.com/messages/v4/send-many';

export class SmsChannel implements NotificationChannel {
  readonly type = 'sms';

  private readonly apiKey:    string;
  private readonly apiSecret: string;
  private readonly from:      string;

  constructor() {
    this.apiKey    = process.env.SMS_API_KEY    || '';
    this.apiSecret = process.env.SMS_API_SECRET || '';
    this.from      = process.env.SMS_FROM       || '';
  }

  isConfigured(): boolean {
    return !!(this.apiKey && this.apiSecret && this.from);
  }

  async send(message: string, targets: string[]): Promise<void> {
    if (!this.isConfigured()) {
      logger.warn('[SMS] 설정 미완료 (SMS_API_KEY / SMS_API_SECRET / SMS_FROM 확인)');
      logger.warn('[SMS] 미발송 대상:', targets.join(', '));
      return;
    }

    // 전화번호 정규화 (하이픈 제거)
    const normalized = targets.map(t => t.replace(/-/g, ''));

    const messages = normalized.map(to => ({
      to,
      from: this.from.replace(/-/g, ''),
      text: message,
    }));

    try {
      const res = await fetch(SOLAPI_URL, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': this.buildAuth(),
        },
        body: JSON.stringify({ messages }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        logger.error(`[SMS] 발송 실패: HTTP ${res.status}`, body);
        return;
      }

      const { errorCount, resultList } = body as any;
      if (errorCount > 0) {
        const failed = (resultList as any[])
          .filter(r => r.statusCode !== 'SEND_PENDING')
          .map(r => `${r.to}(${r.statusCode})`);
        logger.warn(`[SMS] 일부 실패: ${failed.join(', ')}`);
      }

      logger.info(`[SMS] 발송 요청 완료 → ${normalized.join(', ')}`);
    } catch (error) {
      logger.error('[SMS] 발송 오류:', error);
    }
  }

  /** SOLAPI HMAC-SHA256 인증 헤더 생성 */
  private buildAuth(): string {
    const date      = new Date().toISOString();
    const salt      = crypto.randomUUID();
    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(date + salt)
      .digest('hex');

    return `HMAC-SHA256 apiKey=${this.apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
  }
}

export default new SmsChannel();
