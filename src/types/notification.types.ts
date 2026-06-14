export interface Recipient {
  id:          number | string;
  name:        string;
  channelType: string;   // 'sms' | 'email' | ...
  target:      string;   // 전화번호 or 이메일
}

export interface NotificationChannel {
  readonly type: string;
  isConfigured(): boolean;
  send(message: string, targets: string[]): Promise<void>;
}
