import { QueryBuilder } from '../utils/QueryBuilder';
import elasticsearchService from './ElasticsearchService';
import { toKST } from '../utils/dateUtils';
import { HeartbeatMonitor } from '../types';
import logger from '../config/logger';

class HeartbeatService {
  private readonly index: string;

  constructor() {
    this.index = process.env.HEARTBEAT_INDEX_PATTERN || 'heartbeat-*';
  }

  /**
   * 전체 모니터 최신 상태 조회
   */
  async getMonitorStatus(timeRange: string = 'now-5m'): Promise<HeartbeatMonitor[]> {
    try {
      const query = QueryBuilder.buildHeartbeatStatus(timeRange);
      const response = await elasticsearchService.search(query, this.index);
      const buckets = elasticsearchService.extractBuckets(response, 'by_monitor');

      return buckets
        .map(bucket => {
          const source = bucket.latest?.hits?.hits?.[0]?._source;
          if (!source) return null;

          const totalChecks: number = bucket.total_checks?.value || 0;
          const upChecks: number = bucket.up_checks?.doc_count || 0;
          const availabilityPct =
            totalChecks > 0 ? Math.round((upChecks / totalChecks) * 100) : undefined;

          return {
            monitorId: bucket.key as string,
            name: source.monitor?.name || (bucket.key as string),
            type: source.monitor?.type || 'http',
            status: source.monitor?.status || 'down',
            url: source.url?.full,
            ip: source.monitor?.ip,
            port: source.url?.port,
            responseTimeMs:
              source.monitor?.duration?.us != null
                ? Math.round(source.monitor.duration.us / 1000)
                : undefined,
            httpStatus: source.http?.response?.status_code,
            checkedAt: toKST(source['@timestamp'] || ''),
            availabilityPct
          } as HeartbeatMonitor;
        })
        .filter((m): m is HeartbeatMonitor => m !== null);
    } catch (error) {
      logger.error('Failed to get heartbeat monitor status:', error);
      throw error;
    }
  }

  /**
   * 특정 모니터 상태 조회
   */
  async getMonitorById(monitorId: string, timeRange: string = 'now-5m'): Promise<HeartbeatMonitor | null> {
    const monitors = await this.getMonitorStatus(timeRange);
    return monitors.find(m => m.monitorId === monitorId) || null;
  }

  /**
   * IP 기준으로 관련 모니터 조회 (monitor.ip 필드 매칭)
   */
  async getMonitorsByIp(ip: string, timeRange: string = 'now-5m'): Promise<HeartbeatMonitor[]> {
    const monitors = await this.getMonitorStatus(timeRange);
    return monitors.filter(m => m.ip === ip);
  }
}

export default new HeartbeatService();
