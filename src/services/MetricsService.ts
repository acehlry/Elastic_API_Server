import { QueryBuilder } from '../utils/QueryBuilder';
import { Validator } from '../utils/Validator';
import elasticsearchService from './ElasticsearchService';
import {
  MetricData,
  TimeSeriesData,
  AnomalyData,
  ServerOverview,
  ServerTimeSeries,
  MetricType,
  AnomalyLevel,
  Thresholds,
  Bucket
} from '../types';
import logger from '../config/logger';

const HEARTBEAT_THRESHOLD_MS = 5 * 60 * 1000;

const r2 = (n: number): number => Math.round(n * 100) / 100;

class MetricsService {
  private thresholds: Record<MetricType, Thresholds>;

  constructor() {
    this.thresholds = {
      [MetricType.CPU]: {
        error: parseFloat(process.env.CPU_ERROR_THRESHOLD || '0.8'),
        warning: parseFloat(process.env.CPU_WARN_THRESHOLD || '0.7')
      },
      [MetricType.MEMORY]: {
        error: parseFloat(process.env.MEMORY_ERROR_THRESHOLD || '0.85'),
        warning: parseFloat(process.env.MEMORY_WARN_THRESHOLD || '0.75')
      },
      [MetricType.DISK]: {
        error: parseFloat(process.env.DISK_ERROR_THRESHOLD || '0.9'),
        warning: parseFloat(process.env.DISK_WARN_THRESHOLD || '0.8')
      }
    };
  }

  /**
   * 서버의 최신 메트릭 조회
   */
  async getLatestMetrics(ip: string): Promise<MetricData | null> {
    try {
      const query = QueryBuilder.buildLatestMetrics(ip);
      const response = await elasticsearchService.search(query);
      const buckets = elasticsearchService.extractBuckets(response, 'by_metricset');
      return this.parseMetricDataFromBuckets(buckets);
    } catch (error) {
      logger.error(`Failed to get latest metrics for ${ip}:`, error);
      throw error;
    }
  }

  /**
   * 전체 서버 목록 + 현재 리소스 조회
   */
  async getAllServers(timeRange: string = 'now-15m'): Promise<ServerOverview[]> {
    try {
      const query = QueryBuilder.buildAllServers(timeRange);
      const response = await elasticsearchService.search(query);
      const hostBuckets = elasticsearchService.extractBuckets(response, 'by_host');
      const now = Date.now();

      return hostBuckets.map(hostBucket => {
        const metricsetBuckets: Bucket[] = hostBucket.by_metricset?.buckets || [];
        const metricData = this.parseMetricDataFromBuckets(metricsetBuckets);
        const lastSeenEpoch: number = hostBucket.last_seen?.value || 0;
        const lastSeen = lastSeenEpoch
          ? new Date(lastSeenEpoch).toISOString()
          : '';

        const anySource = this.getFirstSource(metricsetBuckets);

        return {
          hostname: hostBucket.key as string,
          ip: metricData?.ip || '',
          os: anySource?.host?.os?.name,
          osVersion: anySource?.host?.os?.version,
          heartbeat: (now - lastSeenEpoch) < HEARTBEAT_THRESHOLD_MS ? 'alive' : 'dead',
          lastSeen,
          cpu: metricData?.cpu,
          memory: metricData?.memory,
          disk: metricData?.disk,
          load1: metricData?.load1,
          load5: metricData?.load5,
          load15: metricData?.load15
        } as ServerOverview;
      });
    } catch (error) {
      logger.error('Failed to get all servers:', error);
      throw error;
    }
  }

  /**
   * 전체 서버 최신 메트릭 조회 (MetricData 포맷)
   */
  async getAllServersLatestMetrics(timeRange: string = 'now-15m'): Promise<MetricData[]> {
    try {
      const query = QueryBuilder.buildAllServers(timeRange);
      const response = await elasticsearchService.search(query);
      const hostBuckets = elasticsearchService.extractBuckets(response, 'by_host');

      return hostBuckets
        .map(hostBucket => {
          const metricsetBuckets: Bucket[] = hostBucket.by_metricset?.buckets || [];
          return this.parseMetricDataFromBuckets(metricsetBuckets);
        })
        .filter((data): data is MetricData => data !== null);
    } catch (error) {
      logger.error('Failed to get all servers latest metrics:', error);
      throw error;
    }
  }

  /**
   * 전체 서버 시계열 조회 (서버별로 묶어서 반환)
   */
  async getAllServersTimeSeries(
    timeRange: string = 'now-1h',
    interval: string = '5m'
  ): Promise<ServerTimeSeries[]> {
    try {
      Validator.validateQuerySize(timeRange, interval);
      const query = QueryBuilder.buildAllServersTimeSeries(timeRange, interval);
      const response = await elasticsearchService.search(query);
      const hostBuckets = elasticsearchService.extractBuckets(response, 'by_host');

      return hostBuckets.map(hostBucket => {
        const hostInfoSource = hostBucket.host_info?.hits?.hits?.[0]?._source;
        const timeBuckets: Bucket[] = hostBucket.time_buckets?.buckets || [];

        return {
          hostname: hostBucket.key as string,
          ip: this.extractIPv4(hostInfoSource?.host?.ip),
          timeSeries: this.parseTimeSeriesBuckets(timeBuckets)
        };
      });
    } catch (error) {
      logger.error('Failed to get all servers time series:', error);
      throw error;
    }
  }

  /**
   * 시계열 데이터 조회
   */
  async getTimeSeriesData(
    ip: string,
    timeRange: string,
    interval: string
  ): Promise<TimeSeriesData[]> {
    try {
      Validator.validateQuerySize(timeRange, interval);
      const query = QueryBuilder.buildTimeSeries(ip, timeRange, interval);
      const response = await elasticsearchService.search(query);
      const buckets = elasticsearchService.extractBuckets(response, 'time_buckets');
      return this.parseTimeSeriesBuckets(buckets);
    } catch (error) {
      logger.error(`Failed to get time series data for ${ip}:`, error);
      throw error;
    }
  }

  /**
   * CPU 이상 감지
   */
  async detectCpuAnomaly(timeRange: string = 'now-5m'): Promise<AnomalyData[]> {
    return this.detectAnomaly(MetricType.CPU, timeRange);
  }

  /**
   * 메모리 이상 감지
   */
  async detectMemoryAnomaly(timeRange: string = 'now-5m'): Promise<AnomalyData[]> {
    return this.detectAnomaly(MetricType.MEMORY, timeRange);
  }

  /**
   * 디스크 이상 감지
   */
  async detectDiskAnomaly(timeRange: string = 'now-5m'): Promise<AnomalyData[]> {
    return this.detectAnomaly(MetricType.DISK, timeRange);
  }

  /**
   * 이상 감지 공통 로직
   */
  private async detectAnomaly(
    metricType: MetricType,
    timeRange: string
  ): Promise<AnomalyData[]> {
    try {
      const query = QueryBuilder.buildAnomalyDetection(metricType, timeRange);
      const response = await elasticsearchService.search(query);
      const buckets = elasticsearchService.extractBuckets(response, 'by_host');

      const results: AnomalyData[] = [];

      for (const bucket of buckets) {
        const latest = bucket.latest?.hits?.hits?.[0];
        if (!latest) continue;

        const source = latest._source;
        const value = this.extractMetricValue(source, metricType);
        const level = this.determineAnomalyLevel(value, metricType);

        results.push({
          ip: this.extractIPv4(source.host?.ip),
          hostname: source.host?.name || '',
          type: `${metricType.toUpperCase()}_HIGH`,
          level,
          faultType: '02',
          faultLevel: this.getFaultLevel(level),
          remarks: this.getRemarks(metricType, value),
          regDt: source['@timestamp'] || '',
          value: r2(value * 100)
        });
      }

      return results;
    } catch (error) {
      logger.error(`Failed to detect ${metricType} anomaly:`, error);
      throw error;
    }
  }

  /**
   * 다중 서버 메트릭 조회
   */
  async getMultipleServerMetrics(
    ips: string[],
    timeRange: string = 'now-1h'
  ): Promise<MetricData[]> {
    try {
      const query = QueryBuilder.buildMultipleHosts(ips, timeRange);
      const response = await elasticsearchService.search(query);
      const hostBuckets = elasticsearchService.extractBuckets(response, 'by_host');

      return hostBuckets.map(hostBucket => {
        const metricsetBuckets: Bucket[] = hostBucket.by_metricset?.buckets || [];
        return this.parseMetricDataFromBuckets(metricsetBuckets);
      }).filter((data): data is MetricData => data !== null);
    } catch (error) {
      logger.error('Failed to get multiple server metrics:', error);
      throw error;
    }
  }

  /**
   * by_metricset 버킷에서 MetricData 파싱
   * CPU, memory, filesystem 각 메트릭셋 문서에서 값을 합산
   */
  private parseMetricDataFromBuckets(buckets: Bucket[]): MetricData | null {
    const cpuBucket = buckets.find(b => b.key === 'cpu');
    const memoryBucket = buckets.find(b => b.key === 'memory');
    const diskBucket = buckets.find(b => b.key === 'filesystem');

    const cpuSource = cpuBucket?.latest?.hits?.hits?.[0]?._source;
    const memorySource = memoryBucket?.latest?.hits?.hits?.[0]?._source;
    const diskSource = diskBucket?.latest?.hits?.hits?.[0]?._source;

    const baseSource = cpuSource || memorySource || diskSource;
    if (!baseSource) return null;

    return {
      timestamp: baseSource['@timestamp'] || '',
      hostname: baseSource.host?.name || '',
      ip: this.extractIPv4(baseSource.host?.ip),
      cpu: cpuSource?.system?.cpu?.total?.norm?.pct != null
        ? r2(cpuSource.system.cpu.total.norm.pct * 100)
        : undefined,
      memory: memorySource?.system?.memory?.used?.pct != null
        ? r2(memorySource.system.memory.used.pct * 100)
        : undefined,
      disk: diskSource?.system?.filesystem?.used?.pct != null
        ? r2(diskSource.system.filesystem.used.pct * 100)
        : undefined,
      load1: cpuSource?.system?.load?.['1'],
      load5: cpuSource?.system?.load?.['5'],
      load15: cpuSource?.system?.load?.['15']
    };
  }

  /**
   * 버킷에서 첫 번째 소스 문서 반환 (host.os 등 공통 필드 추출용)
   */
  private getFirstSource(buckets: Bucket[]): any | null {
    for (const bucket of buckets) {
      const source = bucket.latest?.hits?.hits?.[0]?._source;
      if (source) return source;
    }
    return null;
  }

  /**
   * 시계열 버킷 파싱
   */
  private parseTimeSeriesBuckets(buckets: Bucket[]): TimeSeriesData[] {
    return buckets.map(bucket => ({
      timestamp: bucket.key_as_string || String(bucket.key),
      cpu: r2((bucket.avg_cpu?.value || 0) * 100),
      memory: r2((bucket.avg_memory?.value || 0) * 100),
      disk: r2((bucket.avg_disk?.value || 0) * 100),
      maxCpu: r2((bucket.max_cpu?.value || 0) * 100),
      maxMemory: r2((bucket.max_memory?.value || 0) * 100)
    }));
  }

  /**
   * 메트릭 값 추출
   */
  private extractMetricValue(source: any, metricType: MetricType): number {
    switch (metricType) {
      case MetricType.CPU:
        return source.system?.cpu?.total?.norm?.pct || 0;
      case MetricType.MEMORY:
        return source.system?.memory?.used?.pct || 0;
      case MetricType.DISK:
        return source.system?.filesystem?.used?.pct || 0;
      default:
        return 0;
    }
  }

  /**
   * 이상 수준 판단
   */
  private determineAnomalyLevel(value: number, metricType: MetricType): AnomalyLevel {
    const threshold = this.thresholds[metricType];
    if (value >= threshold.error) return AnomalyLevel.ERROR;
    if (value >= threshold.warning) return AnomalyLevel.WARN;
    return AnomalyLevel.INFO;
  }

  private getFaultLevel(level: AnomalyLevel): string {
    switch (level) {
      case AnomalyLevel.ERROR: return '01';
      case AnomalyLevel.WARN: return '02';
      default: return '03';
    }
  }

  private getRemarks(metricType: MetricType, value: number): string {
    return `${metricType.toUpperCase()} 사용률 ${(value * 100).toFixed(1)}% 감지`;
  }

  private extractIPv4(ips: string | string[] | undefined): string {
    if (!ips) return '';
    const ipArray = Array.isArray(ips) ? ips : [ips];
    return ipArray.find(ip => /^\d+\.\d+\.\d+\.\d+$/.test(ip)) || ipArray[0] || '';
  }
}

export default new MetricsService();
