import { QueryBuilder } from '../utils/QueryBuilder';
import elasticsearchService from './ElasticsearchService';
import { toKST } from '../utils/dateUtils';
import { HeartbeatMonitor, HeartbeatTimeSeries, HeartbeatTimePoint } from '../types';
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

  /**
   * 전체 모니터 시계열 조회
   */
  async getMonitorTimeSeries(
    timeRange: string = 'now-1h',
    interval: string = '5m'
  ): Promise<HeartbeatTimeSeries[]> {
    try {
      const query = QueryBuilder.buildHeartbeatTimeSeries(timeRange, interval);
      const response = await elasticsearchService.search(query, this.index);
      const monitorBuckets = elasticsearchService.extractBuckets(response, 'by_monitor');
      return monitorBuckets.map(b => this.parseMonitorTimeSeries(b));
    } catch (error) {
      logger.error('Failed to get heartbeat monitor time series:', error);
      throw error;
    }
  }

  /**
   * 특정 모니터 시계열 조회
   */
  async getMonitorTimeSeriesById(
    monitorId: string,
    timeRange: string = 'now-1h',
    interval: string = '5m'
  ): Promise<HeartbeatTimeSeries | null> {
    try {
      const query = QueryBuilder.buildHeartbeatTimeSeries(timeRange, interval, monitorId);
      const response = await elasticsearchService.search(query, this.index);
      const monitorBuckets = elasticsearchService.extractBuckets(response, 'by_monitor');
      if (monitorBuckets.length === 0) return null;
      return this.parseMonitorTimeSeries(monitorBuckets[0]);
    } catch (error) {
      logger.error(`Failed to get heartbeat time series for ${monitorId}:`, error);
      throw error;
    }
  }

  private parseMonitorTimeSeries(bucket: any): HeartbeatTimeSeries {
    const infoSource = bucket.monitor_info?.hits?.hits?.[0]?._source;
    const timeBuckets: any[] = bucket.time_buckets?.buckets || [];

    const timeSeries: HeartbeatTimePoint[] = timeBuckets.map(tb => {
      const upCount: number   = tb.up_count?.doc_count   ?? 0;
      const downCount: number = tb.down_count?.doc_count  ?? 0;
      const avgUs: number | null = tb.avg_response_us?.value ?? null;

      let status: 'up' | 'down' | 'mixed';
      if (upCount > 0 && downCount === 0)      status = 'up';
      else if (downCount > 0 && upCount === 0) status = 'down';
      else                                     status = 'mixed';

      return {
        timestamp:      toKST(tb.key_as_string || String(tb.key)),
        status,
        upCount,
        downCount,
        avgResponseMs:  avgUs != null ? Math.round(avgUs / 1000) : undefined,
      };
    });

    return {
      monitorId: bucket.key as string,
      name:      infoSource?.monitor?.name  || (bucket.key as string),
      type:      infoSource?.monitor?.type  || 'http',
      url:       infoSource?.url?.full,
      ip:        infoSource?.monitor?.ip,
      timeSeries,
    };
  }
}

export default new HeartbeatService();
