import logger from '../config/logger';

class SmsService {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly numbers: string[];

  constructor() {
    this.apiUrl   = process.env.SMS_API_URL  || '';
    this.apiKey   = process.env.SMS_API_KEY  || '';
    this.numbers  = (process.env.SMS_NUMBERS || '').split(',').map(n => n.trim()).filter(Boolean);
  }

  get isConfigured(): boolean {
    return !!(this.apiUrl && this.apiKey && this.numbers.length > 0);
  }

  async send(message: string): Promise<void> {
    if (!this.isConfigured) {
      logger.warn('[SMS] 설정 미완료 — 콘솔 출력으로 대체:\n' + message);
      return;
    }

    for (const to of this.numbers) {
      try {
        const res = await fetch(this.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          // SMS API 업체에 따라 body 형식 수정 필요
          body: JSON.stringify({ to, message }),
        });

        if (!res.ok) {
          logger.error(`[SMS] 발송 실패 (${to}): HTTP ${res.status}`);
        } else {
          logger.info(`[SMS] 발송 성공 (${to})`);
        }
      } catch (error) {
        logger.error(`[SMS] 발송 오류 (${to}):`, error);
      }
    }
  }
}

export default new SmsService();
