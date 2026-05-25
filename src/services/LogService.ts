import { QueryBuilder } from '../utils/QueryBuilder';
import elasticsearchService from './ElasticsearchService';
import { LogEntry, LogPage } from '../types';
import logger from '../config/logger';

const LOG_INDEX = process.env.ES_LOG_INDEX_PATTERN || 'app-logs-*';
const MAX_LIMIT = 200;

class LogService {
  /**
   * 특정 서버 IP의 로그 페이징 조회
   */
  async getServerLogs(
    ip: string,
    timeRange: string = 'now-1h',
    page: number = 1,
    limit: number = 50,
  ): Promise<LogPage> {
    const safeLimit = Math.min(limit, MAX_LIMIT);
    const safePage = Math.max(1, page);

    try {
      const query = QueryBuilder.buildServerLogs(ip, timeRange, safePage, safeLimit);
      const response = await elasticsearchService.search(query, LOG_INDEX);

      const total = typeof response.hits.total === 'number'
        ? response.hits.total
        : response.hits.total.value;

      const logs: LogEntry[] = response.hits.hits.map((hit: any) => {
        const s = hit._source;
        return {
          timestamp: s['@timestamp'] || '',
          level: s.log_level || s['log.level'] || s.log?.level || '',
          message: s.message || '',
          parsedMessage: s.log_message || undefined,
          service: s.service_name || undefined,
          hostname: s.host?.name || undefined,
          ip: this.extractIPv4(s.host?.ip),
        };
      });

      return {
        logs,
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      };
    } catch (error) {
      logger.error(`Failed to get logs for ${ip}:`, error);
      throw error;
    }
  }

  private extractIPv4(ips: string | string[] | undefined): string {
    if (!ips) return '';
    const ipArray = Array.isArray(ips) ? ips : [ips];
    return ipArray.find(ip => /^\d+\.\d+\.\d+\.\d+$/.test(ip)) || ipArray[0] || '';
  }
}

export default new LogService();
