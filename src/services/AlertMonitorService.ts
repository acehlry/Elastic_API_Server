import crypto from 'crypto';
import elasticsearchService from './ElasticsearchService';
import notificationService from './NotificationService';
import cmsRepository from '../repositories/CMSRepository';
import logger from '../config/logger';
import { toKST } from '../utils/dateUtils';
import serviceConfigData from '../config/alert-services.json';

export interface ServiceAlertConfig {
  name:     string;
  index:    string;
  levels:   string[];
  keywords: string[];
}

interface ErrorLog {
  timestamp:       string;
  hostname:        string;
  ip?:             string;
  service:         string;
  level:           string;
  message:         string;
  parsedMessage?:  string;
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
  services:       ServiceAlertConfig[];
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
  private cooldownMs: number;
  private readonly serviceConfigs: ServiceAlertConfig[];

  constructor() {
    this.pollIntervalMs  = parseInt(process.env.ALERT_POLL_MS || '30000');
    this.cooldownMs      = 3600000;
    this.serviceConfigs  = serviceConfigData.services as ServiceAlertConfig[];
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.cooldownMs = await cmsRepository.getCooldownMs();

    this.isRunning = true;
    this.schedule();
    logger.info(`[AlertMonitor] 시작 (폴링: ${this.pollIntervalMs}ms, 쿨다운: ${this.cooldownMs}ms)`);
    logger.info(`[AlertMonitor] 감시 서비스 ${this.serviceConfigs.length}개:`);
    this.serviceConfigs.forEach(s => {
      const kw = s.keywords.length ? ` | 키워드: ${s.keywords.join(', ')}` : '';
      logger.info(`  - ${s.name} → 레벨: ${s.levels.join('/')}${kw}`);
    });
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
      services:       this.serviceConfigs,
    };
  }

  getServiceConfigs(): ServiceAlertConfig[] {
    return this.serviceConfigs;
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
    // 서비스별로 독립적인 조건 빌드:
    // 각 서비스는 자신의 service_name 필터 + (레벨 OR 키워드) 조건을 가짐
    const shouldClauses = this.serviceConfigs.map(svc => ({
      bool: {
        filter: [{ term: { service_name: svc.name } }],
        should: [
          { terms: { 'log_level.keyword': svc.levels } },
          { terms: { 'log_level':         svc.levels } },
          ...svc.keywords.map(kw => ({
            multi_match: {
              query:  kw,
              fields: ['log_message', 'message'],
              type:   'phrase',
            },
          })),
        ],
        minimum_should_match: 1,
      },
    }));

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
        includes: [
          '@timestamp', 'message', 'log_message', 'log_level',
          'service_name', 'host.name', 'host.ip',
        ],
      },
    };

    const indices  = this.serviceConfigs.map(s => s.index).join(',');
    const response = await elasticsearchService.search(query as any, indices);

    return response.hits.hits.map((hit: any) => {
      const s           = hit._source;
      const body        = s.log_message || s.message || '';
      const serviceName = (s.service_name || '') as string;
      const svcConfig   = this.serviceConfigs.find(c => c.name === serviceName);

      return {
        timestamp:      s['@timestamp']              || '',
        hostname:       s.host?.name                 || 'unknown',
        ip:             this.extractIPv4(s.host?.ip),
        service:        serviceName,
        level:          (s.log_level || '').trim(),
        message:        s.message                    || '',
        parsedMessage:  s.log_message                || undefined,
        matchedKeyword: svcConfig
          ? this.findMatchedKeyword(body, svcConfig.keywords)
          : undefined,
      };
    });
  }

  private async handleError(err: ErrorLog): Promise<void> {
    const normalized = this.normalizeMessage(err.parsedMessage || err.message);
    // 쿨다운 키: 호스트 + 서비스 + 정규화된 메시지
    // → 다른 서비스의 동일 에러는 별도 알람, 같은 서비스 내 동일 에러는 억제
    const key     = this.buildKey(err.hostname, err.service, normalized);
    const now     = Date.now();
    const existing = this.cooldowns.get(key);

    if (existing && existing.expiresAt > now) {
      existing.suppressedCount++;
      existing.lastSeenAt = toKST(err.timestamp);
      logger.debug(`[AlertMonitor] 쿨다운 억제 (${err.hostname}/${err.service}) #${existing.suppressedCount}`);
      return;
    }

    const suppressedCount = existing?.suppressedCount ?? 0;
    const isLevelTrigger  = (() => {
      const svcConfig = this.serviceConfigs.find(c => c.name === err.service);
      const levels    = svcConfig?.levels ?? ['ERROR', 'ERR'];
      return levels.includes(err.level.toUpperCase());
    })();
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
    logger.info(`[AlertMonitor] 알람 발송 [${triggerType}]: ${err.hostname}/${err.service}`);
    await notificationService.notify(message);
  }

  private buildSmsText(
    err: ErrorLog,
    suppressedCount: number,
    triggerType: 'level' | 'keyword',
  ): string {
    const tag      = triggerType === 'keyword'
      ? `[키워드: ${err.matchedKeyword}]`
      : `[${err.level}]`;

    const hostLine   = err.ip ? `${err.hostname} (${err.ip})` : err.hostname;
    const body       = err.parsedMessage || err.message;
    const truncated  = body.length > 100 ? body.slice(0, 100) + '...' : body;
    const suppressed = suppressedCount > 0 ? `\n(이전 ${suppressedCount}건 억제됨)` : '';

    return `${tag}\n서비스: ${err.service}\n호스트: ${hostLine}\n내용: ${truncated}${suppressed}`;
  }

  /** 서비스별 키워드 목록에서 첫 번째 매칭 키워드 반환 */
  private findMatchedKeyword(text: string, keywords: string[]): string | undefined {
    const lower = text.toLowerCase();
    return keywords.find(kw => lower.includes(kw.toLowerCase()));
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

  /** 쿨다운 키: 호스트 + 서비스 + 정규화 메시지 조합 */
  private buildKey(hostname: string, service: string, normalizedMessage: string): string {
    return crypto
      .createHash('md5')
      .update(`${hostname}::${service}::${normalizedMessage}`)
      .digest('hex');
  }

  /** host.ip 배열 또는 문자열에서 IPv4 주소 반환 */
  private extractIPv4(raw: string | string[] | undefined): string | undefined {
    if (!raw) return undefined;
    const list = Array.isArray(raw) ? raw : [raw];
    return list.find(ip => /^\d+\.\d+\.\d+\.\d+$/.test(ip));
  }
}

export default new AlertMonitorService();
