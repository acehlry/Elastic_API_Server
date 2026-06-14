import crypto from 'crypto';
import elasticsearchService from './ElasticsearchService';
import smsService from './SmsService';
import logger from '../config/logger';
import { toKST } from '../utils/dateUtils';

const DEFAULT_INDICES = [
  'logs-was-*',
  'logs-cxf-*',
  'logs-ingest_system_error-*',
  'logs-playout_system_error-*',
  'logs-system_manager-*',
  'logs-imedia_processor-*',
];

const ALERT_LEVELS = ['ERROR', 'ERR'];

interface ErrorLog {
  timestamp:      string;
  hostname:       string;
  service:        string;
  level:          string;
  message:        string;
  parsedMessage?: string;
  matchedKeyword?: string;
}

export interface CooldownEntry {
  key:             string;
  hostname:        string;
  service:         string;
  normalizedMsg:   string;
  triggerType:     'level' | 'keyword';
  matchedKeyword?: string;
  suppressedCount: number;
  firstSeenAt:     string;
  lastSeenAt:      string;
  expiresAt:       string;
}

export interface AlertStatus {
  running:        boolean;
  lastPollAt:     string | null;
  nextPollAt:     string | null;
  cooldownCount:  number;
  pollIntervalMs: number;
  cooldownMs:     number;
  indices:        string[];
  alertLevels:    string[];
  keywords:       string[];
  smsConfigured:  boolean;
}

class AlertMonitorService {
  private cooldowns = new Map<string, {
    expiresAt:       number;
    suppressedCount: number;
    firstSeenAt:     string;
    lastSeenAt:      string;
    hostname:        string;
    service:         string;
    normalizedMsg:   string;
    triggerType:     'level' | 'keyword';
    matchedKeyword?: string;
  }>();

  private timer:      NodeJS.Timeout | null = null;
  private lastPollAt: Date | null = null;
  private isRunning = false;

  private readonly pollIntervalMs: number;
  private readonly cooldownMs:     number;
  private readonly indices:        string[];
  private readonly keywords:       string[];

  constructor() {
    this.pollIntervalMs = parseInt(process.env.ALERT_POLL_MS     || '30000');
    this.cooldownMs     = parseInt(process.env.ALERT_COOLDOWN_MS || '3600000');
    this.indices = process.env.ALERT_INDICES
      ? process.env.ALERT_INDICES.split(',').map(s => s.trim())
      : DEFAULT_INDICES;
    this.keywords = (process.env.ALERT_KEYWORDS || '')
      .split(',').map(k => k.trim()).filter(Boolean);
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.schedule();
    logger.info(`[AlertMonitor] 시작 (폴링: ${this.pollIntervalMs}ms, 쿨다운: ${this.cooldownMs}ms)`);
    logger.info(`[AlertMonitor] 레벨: ${ALERT_LEVELS.join(', ')}`);
    if (this.keywords.length > 0) {
      logger.info(`[AlertMonitor] 키워드: ${this.keywords.join(', ')}`);
    }
  }

  stop(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.isRunning = false;
    logger.info('[AlertMonitor] 중지');
  }

  getStatus(): AlertStatus {
    return {
      running:        this.isRunning,
      lastPollAt:     this.lastPollAt ? toKST(this.lastPollAt.toISOString()) : null,
      nextPollAt:     this.lastPollAt && this.isRunning
        ? toKST(new Date(this.lastPollAt.getTime() + this.pollIntervalMs).toISOString())
        : null,
      cooldownCount:  this.cooldowns.size,
      pollIntervalMs: this.pollIntervalMs,
      cooldownMs:     this.cooldownMs,
      indices:        this.indices,
      alertLevels:    ALERT_LEVELS,
      keywords:       this.keywords,
      smsConfigured:  smsService.isConfigured,
    };
  }

  getCooldowns(): CooldownEntry[] {
    const now = Date.now();
    const result: CooldownEntry[] = [];

    for (const [key, entry] of this.cooldowns.entries()) {
      if (entry.expiresAt <= now) {
        this.cooldowns.delete(key);
        continue;
      }
      result.push({
        key,
        hostname:        entry.hostname,
        service:         entry.service,
        normalizedMsg:   entry.normalizedMsg,
        triggerType:     entry.triggerType,
        matchedKeyword:  entry.matchedKeyword,
        suppressedCount: entry.suppressedCount,
        firstSeenAt:     entry.firstSeenAt,
        lastSeenAt:      entry.lastSeenAt,
        expiresAt:       toKST(new Date(entry.expiresAt).toISOString()),
      });
    }

    return result;
  }

  private schedule(): void {
    this.timer = setTimeout(async () => {
      await this.poll();
      if (this.isRunning) this.schedule();
    }, this.pollIntervalMs);
  }

  private async poll(): Promise<void> {
    const since = this.lastPollAt ?? new Date(Date.now() - this.pollIntervalMs);
    this.lastPollAt = new Date();

    try {
      const errors = await this.fetchErrors(since);
      if (errors.length > 0) {
        logger.debug(`[AlertMonitor] ${errors.length}건 감지`);
      }
      for (const err of errors) {
        await this.handleError(err);
      }
    } catch (error) {
      logger.error('[AlertMonitor] 폴링 오류:', error);
    }
  }

  private async fetchErrors(since: Date): Promise<ErrorLog[]> {
    // should: 레벨 조건 OR 키워드 조건 중 하나라도 일치하면 감지
    const shouldClauses: any[] = [
      { terms: { 'log_level.keyword': ALERT_LEVELS } },
      ...this.keywords.map(kw => ({
        multi_match: {
          query:  kw,
          fields: ['log_message', 'message'],
          type:   'phrase',
        },
      })),
    ];

    const query = {
      size: 100,
      query: {
        bool: {
          must: [
            { range: { '@timestamp': { gte: since.toISOString(), lte: 'now' } } },
          ],
          should:               shouldClauses,
          minimum_should_match: 1,
        },
      },
      sort: [{ '@timestamp': { order: 'asc' as const } }],
      _source: {
        includes: ['@timestamp', 'message', 'log_message', 'log_level', 'service_name', 'host.name'],
      },
    };

    const response = await elasticsearchService.search(query as any, this.indices.join(','));

    return response.hits.hits.map((hit: any) => {
      const s = hit._source;
      const body = s.log_message || s.message || '';
      return {
        timestamp:      s['@timestamp'] || '',
        hostname:       s.host?.name    || 'unknown',
        service:        s.service_name  || '',
        level:          s.log_level     || '',
        message:        s.message       || '',
        parsedMessage:  s.log_message   || undefined,
        matchedKeyword: this.findMatchedKeyword(body),
      };
    });
  }

  private async handleError(err: ErrorLog): Promise<void> {
    const normalized = this.normalizeMessage(err.parsedMessage || err.message);
    const key = this.buildKey(err.hostname, normalized);
    const now = Date.now();
    const existing = this.cooldowns.get(key);

    if (existing && existing.expiresAt > now) {
      existing.suppressedCount++;
      existing.lastSeenAt = toKST(err.timestamp);
      logger.debug(`[AlertMonitor] 쿨다운 억제 (${err.hostname}/${err.service}) #${existing.suppressedCount}`);
      return;
    }

    const suppressedCount = existing?.suppressedCount ?? 0;
    const isLevelTrigger  = ALERT_LEVELS.includes(err.level.toUpperCase());
    const triggerType: 'level' | 'keyword' = isLevelTrigger ? 'level' : 'keyword';

    this.cooldowns.set(key, {
      expiresAt:       now + this.cooldownMs,
      suppressedCount: 0,
      firstSeenAt:     toKST(err.timestamp),
      lastSeenAt:      toKST(err.timestamp),
      hostname:        err.hostname,
      service:         err.service,
      normalizedMsg:   normalized,
      triggerType,
      matchedKeyword:  err.matchedKeyword,
    });

    const message = this.buildSmsText(err, suppressedCount, triggerType);
    logger.info(`[AlertMonitor] SMS 발송 [${triggerType}]: ${err.hostname}/${err.service}`);
    await smsService.send(message);
  }

  private buildSmsText(
    err: ErrorLog,
    suppressedCount: number,
    triggerType: 'level' | 'keyword',
  ): string {
    const tag = triggerType === 'keyword'
      ? `[키워드: ${err.matchedKeyword}]`
      : `[${err.level}]`;

    const body      = err.parsedMessage || err.message;
    const truncated = body.length > 100 ? body.slice(0, 100) + '...' : body;
    const suppressed = suppressedCount > 0 ? `\n(이전 ${suppressedCount}건 억제됨)` : '';

    return `${tag} ${err.hostname} / ${err.service}\n${truncated}${suppressed}`;
  }

  /** 메시지에서 설정된 키워드 중 첫 번째 일치 항목 반환 */
  private findMatchedKeyword(text: string): string | undefined {
    const lower = text.toLowerCase();
    return this.keywords.find(kw => lower.includes(kw.toLowerCase()));
  }

  /** 타임스탬프·UUID·숫자ID를 제거하여 동일 에러 패턴 식별에 사용 */
  private normalizeMessage(message: string): string {
    return message
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '{UUID}')
      .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[.,\d]*/g, '{TS}')
      .replace(/\d{2}:\d{2}:\d{2}[:.]\d+/g, '{TIME}')
      .replace(/:\d{1,6}\)/g, ':N)')
      .replace(/\b\d{5,}\b/g, '{N}')
      .trim();
  }

  private buildKey(hostname: string, normalizedMessage: string): string {
    return crypto
      .createHash('md5')
      .update(`${hostname}::${normalizedMessage}`)
      .digest('hex');
  }
}

export default new AlertMonitorService();
