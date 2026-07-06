export interface ServiceAlertConfig {
  name: string;
  index: string;
  levels: string[];
  keywords: string[];
}

export interface ErrorLog {
  timestamp: string;
  hostname: string;
  ip?: string;
  service: string;
  level: string;
  message: string;
  parsedMessage?: string;
  matchedKeyword?: string;
}

export interface CooldownEntry {
  key: string;
  hostname: string;
  service: string;
  normalizedMsg: string;
  triggerType: 'level' | 'keyword';
  matchedKeyword?: string;
  suppressedCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

export interface AlertStatus {
  running: boolean;
  lastPollAt: string | null;
  nextPollAt: string | null;
  cooldownCount: number;
  pollIntervalMs: number;
  cooldownMs: number;
  services: ServiceAlertConfig[];
}