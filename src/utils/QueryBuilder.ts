import queryTemplateLoader from './QueryTemplateLoader';
import {
    SearchQuery,
    MustClause,
    QueryBuilderParams,
    MetricType,
} from '../types';

export class QueryBuilder {
    /**
     * log_level 필터: keyword 매핑 방식에 따라 log_level.keyword / log_level 둘 다 시도
     * log_level 값에 trailing space가 있어도 매칭되도록 should 구조 사용
     */
    static logLevelFilter(levels: string[]): MustClause {
        return {
            bool: {
                should: [
                    { terms: { 'log_level.keyword': levels } },
                    { terms: { 'log_level': levels } },
                ],
                minimum_should_match: 1,
            },
        } as unknown as MustClause;
    }

    /**
     * Must 절 생성 헬퍼
     */
    static mustClauses = {
        rangeTime(gte: string, lte: string = 'now'): MustClause {
            return {
                range: {
                    '@timestamp': { gte, lte },
                },
            };
        },

        term(field: string, value: string | number): MustClause {
            return {
                term: { [field]: value },
            };
        },

        terms(field: string, values: Array<string | number>): MustClause {
            return {
                terms: { [field]: values },
            };
        },

        match(field: string, value: string): MustClause {
            return {
                match: { [field]: value },
            };
        },

        exists(field: string): MustClause {
            return {
                exists: { field },
            };
        },

        // 메트릭 타입 헬퍼
        cpuMetric(): MustClause {
            return this.term('metricset.name', 'cpu');
        },

        memoryMetric(): MustClause {
            return this.term('metricset.name', 'memory');
        },

        diskMetric(): MustClause {
            return this.term('metricset.name', 'filesystem');
        },

        host(hostname: string): MustClause {
            return this.term('host.name', hostname);
        },

        hostByIp(ip: string): MustClause {
            return this.term('host.ip', ip);
        },
    };

    /**
     * 템플릿 기반 쿼리 빌드
     */
    static build(
        templateName: string,
        mustClauses: MustClause[] = [],
        params: QueryBuilderParams = {},
    ): SearchQuery {
        const template = queryTemplateLoader.load(templateName);

        // must 절 추가
        if (mustClauses.length > 0) {
            template.query.bool.must.push(...mustClauses);
        }

        // 파라미터 치환
        let queryStr = JSON.stringify(template);
        for (const [key, value] of Object.entries(params)) {
            const placeholder = `{{${key}}}`;
            queryStr = queryStr.replace(
                new RegExp(placeholder, 'g'),
                String(value),
            );
        }

        return JSON.parse(queryStr) as SearchQuery;
    }

    /**
     * 시계열 쿼리 빌드
     */
    static buildTimeSeries(
        ip: string,
        timeRange: string,
        interval: string = '5m',
    ): SearchQuery {
        return this.build(
            'time-series',
            [
                this.mustClauses.rangeTime(timeRange),
                this.mustClauses.hostByIp(ip),
            ],
            {
                interval,
                start_time: timeRange,
                end_time: 'now',
            },
        );
    }

    /**
     * 이상 감지 쿼리 빌드
     */
    static buildAnomalyDetection(
        metricType: MetricType,
        timeRange: string = 'now-5m',
    ): SearchQuery {
        const metricMethodMap: Record<MetricType, () => MustClause> = {
            [MetricType.CPU]: () => this.mustClauses.cpuMetric(),
            [MetricType.MEMORY]: () => this.mustClauses.memoryMetric(),
            [MetricType.DISK]: () => this.mustClauses.diskMetric(),
        };

        return this.build(`${metricType}-anomaly`, [
            this.mustClauses.rangeTime(timeRange),
            metricMethodMap[metricType](),
        ]);
    }

    /**
     * 최신 메트릭 쿼리 빌드
     */
    static buildLatestMetrics(ip: string): SearchQuery {
        return this.build('latest-metrics', [
            this.mustClauses.rangeTime('now-5m'),
            this.mustClauses.hostByIp(ip),
        ]);
    }

    /**
     * 전체 서버 목록 쿼리 빌드
     */
    static buildAllServersTimeSeries(
        timeRange: string = 'now-1h',
        interval: string = '5m',
    ): SearchQuery {
        return this.build(
            'all-servers-timeseries',
            [this.mustClauses.rangeTime(timeRange)],
            { interval, start_time: timeRange, end_time: 'now' },
        );
    }

    static buildAllServers(timeRange: string = 'now-15m'): SearchQuery {
        return this.build('all-servers', [
            this.mustClauses.rangeTime(timeRange),
        ]);
    }

    /**
     * 다중 서버 메트릭 쿼리 빌드
     */
    static buildServerLogs(
        ip: string,
        timeRange: string,
        page: number,
        limit: number,
        levels?: string[],
    ): SearchQuery {
        const mustClauses = [
            this.mustClauses.rangeTime(timeRange),
            this.mustClauses.term('host.ip', ip),
        ];

        if (levels && levels.length > 0) {
            mustClauses.push(this.logLevelFilter(levels));
        }

        const query = this.build('server-logs', mustClauses);
        query.size = limit;
        query.from = (page - 1) * limit;
        return query;
    }

    static buildHeartbeatStatus(timeRange: string = 'now-5m'): SearchQuery {
        return this.build('heartbeat-status', [
            this.mustClauses.rangeTime(timeRange),
        ]);
    }

    static buildHeartbeatTimeSeries(
        timeRange: string = 'now-1h',
        interval: string = '5m',
        monitorId?: string,
    ): SearchQuery {
        const clauses = [this.mustClauses.rangeTime(timeRange)];
        if (monitorId) clauses.push(this.mustClauses.term('monitor.id', monitorId));
        return this.build(
            'heartbeat-timeseries',
            clauses,
            { interval, start_time: timeRange, end_time: 'now' },
        );
    }

    static buildMultipleHosts(
        ips: string[],
        timeRange: string = 'now-1h',
    ): SearchQuery {
        return this.build('all-servers', [
            this.mustClauses.rangeTime(timeRange),
            this.mustClauses.terms('host.ip', ips),
        ]);
    }

    /**
     * 서비스명 기반 로그 쿼리 빌드
     */
    static buildServiceLogs(
        serviceName: string,
        timeRange: string,
        page: number,
        limit: number,
        levels?: string[],
        keyword?: string,
    ): SearchQuery {
        const mustClauses: MustClause[] = [
            this.mustClauses.rangeTime(timeRange),
            this.mustClauses.term('service_name', serviceName),
        ];

        if (levels && levels.length > 0) {
            mustClauses.push(this.logLevelFilter(levels));
        }

        if (keyword) {
            mustClauses.push(this.mustClauses.match('log_message', keyword));
        }

        const query = this.build('service-logs', mustClauses);
        query.size = limit;
        query.from = (page - 1) * limit;
        return query;
    }
}
