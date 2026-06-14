import { NotificationChannel } from '../types/notification.types';
import cmsRepository from '../repositories/CMSRepository';
import smsChannel from '../channels/SmsChannel';
import emailChannel from '../channels/EmailChannel';
import logger from '../config/logger';

class NotificationService {
  private channels = new Map<string, NotificationChannel>();

  constructor() {
    this.register(smsChannel);
    this.register(emailChannel);
  }

  /** 추후 채널 추가 시 (Slack, Webhook 등) */
  register(channel: NotificationChannel): this {
    this.channels.set(channel.type, channel);
    return this;
  }

  /** DB에서 수신자 조회 후 발송 (실제 운영용) */
  async notify(message: string): Promise<void> {
    const recipients = await cmsRepository.getAlertRecipients();

    if (recipients.length === 0) {
      logger.warn('[Notification] 활성 수신자 없음');
      return;
    }

    const byChannel = new Map<string, string[]>();
    for (const r of recipients) {
      if (!byChannel.has(r.channelType)) byChannel.set(r.channelType, []);
      byChannel.get(r.channelType)!.push(r.target);
    }

    await this.dispatch(message, byChannel);
  }

  /** 수신자를 직접 지정하여 발송 (테스트용) */
  async notifyDirect(
    message: string,
    targets: { phones?: string[]; emails?: string[] },
  ): Promise<void> {
    const byChannel = new Map<string, string[]>();
    if (targets.phones?.length)  byChannel.set('sms',   targets.phones);
    if (targets.emails?.length)  byChannel.set('email', targets.emails);

    if (byChannel.size === 0) {
      logger.warn('[Notification] 발송 대상 없음');
      return;
    }

    await this.dispatch(message, byChannel);
  }

  getChannelStatus(): { type: string; configured: boolean }[] {
    return Array.from(this.channels.values()).map(ch => ({
      type:       ch.type,
      configured: ch.isConfigured(),
    }));
  }

  private async dispatch(
    message: string,
    byChannel: Map<string, string[]>,
  ): Promise<void> {
    for (const [type, targets] of byChannel.entries()) {
      const channel = this.channels.get(type);
      if (!channel) {
        logger.warn(`[Notification] 미등록 채널 무시: ${type} (${targets.length}명)`);
        continue;
      }
      if (!channel.isConfigured()) {
        logger.warn(`[Notification] 미설정 채널 무시: ${type}`);
        continue;
      }
      logger.info(`[Notification] ${type} → ${targets.length}명 발송`);
      await channel.send(message, targets);
    }
  }

  async close(): Promise<void> {
    await cmsRepository.close();
  }
}

export default new NotificationService();
