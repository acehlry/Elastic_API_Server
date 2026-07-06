import { QueryBuilder } from '../utils/QueryBuilder';
import elasticsearchService from './ElasticsearchService';
import { toKST } from '../utils/dateUtils';
import { LogEntry, LogPage } from '../types';
import logger from '../config/logger';

// TODO: 로그 수집 제공 서비스 명, 추후에 DB나 다른 설정으로 관리
export const SERVICE_NAMES = [
    'was',
    'cxf',
    'upload',
    'device',
    'smc',
    'system_manager',
    'imedia_processor',
    'ingest_cms',
    'ingest_cmslocal',
    'ingest_system',
    'ingest_nosignal',
    'ingest_system_error',
    'playout_system',
    'playout_system_error',
] as const;

export type ServiceName = (typeof SERVICE_NAMES)[number];

const MAX_LIMIT = 200;

class LogService {
    /**
     * 
     * 서비스명 기반 로그 페이징 조회
     * 
     * 인덱스: logs-{serviceName}-*
     * 
     * 이력사항
     * 
     * 2026.07.06 K.C.S 작성
     * 
     * @param serviceName 서비스 명
     * @param timeRange 조회 시간 범위
     * @param page 페이지 번호
     * @param limit 페이지 당 조회 수
     * @param levels 로그 레벨 (배열)
     * @param keyword 검색 단어
     */
    async getServiceLogs(
        serviceName: string,
        timeRange: string = 'now-1h',
        page: number = 1,
        limit: number = 50,
        levels?: string[],
        keyword?: string,
    ): Promise<LogPage> {
        const safeLimit = Math.min(limit, MAX_LIMIT);
        const safePage = Math.max(1, page);
        const normalizedLevels = levels?.map((l) => l.toUpperCase()).filter(Boolean);

        try {
            const query = QueryBuilder.buildServiceLogs(
                serviceName,
                timeRange,
                safePage,
                safeLimit,
                normalizedLevels?.length ? normalizedLevels : undefined,
                keyword,
            );

            const index = `logs-${serviceName}-*`;
            const response = await elasticsearchService.search(query, index);
            
            const total =
                typeof response.hits.total === 'number'
                    ? response.hits.total
                    : response.hits.total.value;

            const logs: LogEntry[] = response.hits.hits.map((hit: any) =>
                this.parseLogEntry(hit._source),
            );

            return {
                logs,
                total,
                page: safePage,
                limit: safeLimit,
                totalPages: Math.ceil(total / safeLimit),
            };
        } catch (error) {
            logger.error( `Failed to get logs for service ${serviceName}:`, error);
            throw error;
        }
    }

    /**
     * 특정 서버 IP/hostname 기준 로그 페이징 조회
     * 
     * 인덱스: logs-*
     * 
     * 이력사항
     * 
     * 2026.07.06 K.C.S 작성
     * 
     * @param ip IP 주소
     * @param timeRange 조회 시간 범위
     * @param page 페이지 번호
     * @param limit 페이지 당 조회 수
     * @param levels 로그 레벨 (배열)
     */
    async getServerLogs(
        ip: string,
        timeRange: string = 'now-1h',
        page: number = 1,
        limit: number = 50,
        levels?: string[],
    ): Promise<LogPage> {
        const safeLimit = Math.min(limit, MAX_LIMIT);
        const safePage = Math.max(1, page);
        const normalizedLevels = levels?.map((l) => l.toUpperCase()).filter(Boolean);
        
        try {
            const query = QueryBuilder.buildServerLogs(
                ip,
                timeRange,
                safePage,
                safeLimit,
                normalizedLevels?.length ? normalizedLevels : undefined,
            );

            const response = await elasticsearchService.search(query, 'logs-*');

            const total =
                typeof response.hits.total === 'number'
                    ? response.hits.total
                    : response.hits.total.value;

            const logs: LogEntry[] = response.hits.hits.map((hit: any) =>
                this.parseLogEntry(hit._source),
            );

            return {
                logs,
                total,
                page: safePage,
                limit: safeLimit,
                totalPages: Math.ceil(total / safeLimit),
            };
        } catch (error) {
            logger.error(`Failed to get logs for server ${ip}:`, error);
            throw error;
        }
    }

    /**
     * 
     * @param s 
     * @returns 
     */
    private parseLogEntry(s: any): LogEntry {
        return {
            timestamp: toKST(s['@timestamp'] || ''),
            level: s.log_level || s['log.level'] || s.log?.level || '',
            message: s.message || '',
            logTime: s.log_time || undefined,
            service: s.service_name || undefined,
            module: s.log_module || undefined,
            instance: s.log_instance || undefined,
            jobId: s.log_job_id || undefined,
            hostname: s.host?.name || undefined,
            ip: this.extractIPv4(s.host?.ip),
            logFilePath: s.log?.file?.path || undefined,
        };
    }

    private extractIPv4(ips: string | string[] | undefined): string {
        if (!ips) return '';
        const ipArray = Array.isArray(ips) ? ips : [ips];
        return (
            ipArray.find((ip) => /^\d+\.\d+\.\d+\.\d+$/.test(ip)) ||
            ipArray[0] ||
            ''
        );
    }
}

export default new LogService();
