import swaggerJsdoc from 'swagger-jsdoc';
import path from 'path';

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Elastic API',
            version: '1.0.0',
            description: 'Elasticsearch 기반 서버 메트릭 모니터링 API',
        },
        servers: [{ url: '/api', description: 'API Server' }],
        tags: [
            { name: 'System', description: '서버 상태 확인' },
            { name: 'Servers', description: '서버 목록 및 메트릭 조회' },
            { name: 'Metrics', description: '이상 감지 (CPU / Memory / Disk)' },
            { name: 'Heartbeat', description: 'Elastic Heartbeat 모니터 상태' },
        ],
        components: {
            schemas: {
                MetricData: {
                    type: 'object',
                    properties: {
                        timestamp: {
                            type: 'string',
                            example: '2026-05-27T18:42:46.644+09:00',
                        },
                        hostname: { type: 'string', example: 'web-server-01' },
                        ip: { type: 'string', example: '192.168.0.10' },
                        os: {
                            type: 'string',
                            example: 'Ubuntu',
                            nullable: true,
                        },
                        osVersion: {
                            type: 'string',
                            example: '22.04.3 LTS',
                            nullable: true,
                        },
                        cpu: { type: 'number', example: 45.2, nullable: true },
                        memory: {
                            type: 'number',
                            example: 67.8,
                            nullable: true,
                        },
                        disk: { type: 'number', example: 32.1, nullable: true },
                        load1: { type: 'number', example: 0.8, nullable: true },
                        load5: { type: 'number', example: 1.2, nullable: true },
                        load15: {
                            type: 'number',
                            example: 0.9,
                            nullable: true,
                        },
                        networkIn: {
                            type: 'number',
                            example: 12.5,
                            nullable: true,
                            description: '수신 처리량 (KB/s)',
                        },
                        networkOut: {
                            type: 'number',
                            example: 5.3,
                            nullable: true,
                            description: '송신 처리량 (KB/s)',
                        },
                    },
                },
                TimeSeriesData: {
                    type: 'object',
                    properties: {
                        timestamp: {
                            type: 'string',
                            example: '2026-05-27T18:00:00.000+09:00',
                        },
                        cpu: { type: 'number', example: 45.2 },
                        memory: { type: 'number', example: 67.8 },
                        disk: { type: 'number', example: 32.1 },
                        maxCpu: { type: 'number', example: 78.0 },
                        maxMemory: { type: 'number', example: 82.3 },
                        networkIn: {
                            type: 'number',
                            example: 15.3,
                            description: '수신 처리량 (KB/s)',
                        },
                        networkOut: {
                            type: 'number',
                            example: 8.1,
                            description: '송신 처리량 (KB/s)',
                        },
                    },
                },
                AnomalyData: {
                    type: 'object',
                    properties: {
                        ip: { type: 'string', example: '192.168.0.10' },
                        hostname: { type: 'string', example: 'web-server-01' },
                        type: { type: 'string', example: 'CPU_HIGH' },
                        level: {
                            type: 'string',
                            enum: ['ERROR', 'WARN', 'INFO'],
                            example: 'WARN',
                        },
                        faultType: { type: 'string', example: '02' },
                        faultLevel: { type: 'string', example: '02' },
                        remarks: {
                            type: 'string',
                            example: 'CPU 사용률 75.0% 감지',
                        },
                        regDt: {
                            type: 'string',
                            example: '2026-05-27T18:42:46.644+09:00',
                        },
                        value: { type: 'number', example: 75.0 },
                    },
                },
                ServerOverview: {
                    type: 'object',
                    properties: {
                        hostname: { type: 'string', example: 'web-server-01' },
                        ip: { type: 'string', example: '192.168.0.10' },
                        os: {
                            type: 'string',
                            example: 'Ubuntu',
                            nullable: true,
                        },
                        osVersion: {
                            type: 'string',
                            example: '22.04.3 LTS',
                            nullable: true,
                        },
                        heartbeat: {
                            type: 'string',
                            enum: ['alive', 'dead'],
                            example: 'alive',
                        },
                        lastSeen: {
                            type: 'string',
                            example: '2026-05-27T18:42:46.644+09:00',
                        },
                        cpu: { type: 'number', example: 45.2, nullable: true },
                        memory: {
                            type: 'number',
                            example: 67.8,
                            nullable: true,
                        },
                        disk: { type: 'number', example: 32.1, nullable: true },
                        load1: { type: 'number', example: 0.8, nullable: true },
                        load5: { type: 'number', example: 1.2, nullable: true },
                        load15: {
                            type: 'number',
                            example: 0.9,
                            nullable: true,
                        },
                        networkIn: {
                            type: 'number',
                            example: 1024.5,
                            nullable: true,
                        },
                        networkOut: {
                            type: 'number',
                            example: 512.3,
                            nullable: true,
                        },
                    },
                },
                ServerTimeSeries: {
                    type: 'object',
                    properties: {
                        hostname: { type: 'string', example: 'web-server-01' },
                        ip: { type: 'string', example: '192.168.0.10' },
                        timeSeries: {
                            type: 'array',
                            items: {
                                $ref: '#/components/schemas/TimeSeriesData',
                            },
                        },
                    },
                },
                HeartbeatEntry: {
                    type: 'object',
                    properties: {
                        hostname: { type: 'string', example: 'web-server-01' },
                        ip: { type: 'string', example: '192.168.0.10' },
                        status: {
                            type: 'string',
                            enum: ['alive', 'dead'],
                            example: 'alive',
                        },
                        lastSeen: {
                            type: 'string',
                            example: '2026-05-27T18:42:46.644+09:00',
                        },
                        cpu: { type: 'number', example: 45.2, nullable: true },
                        memory: {
                            type: 'number',
                            example: 67.8,
                            nullable: true,
                        },
                        disk: { type: 'number', example: 32.1, nullable: true },
                    },
                },
                HeartbeatTimePoint: {
                    type: 'object',
                    properties: {
                        timestamp: {
                            type: 'string',
                            example: '2026-05-27T18:00:00.000+09:00',
                        },
                        status: {
                            type: 'string',
                            enum: ['up', 'down', 'mixed'],
                            example: 'up',
                        },
                        upCount: { type: 'integer', example: 6 },
                        downCount: { type: 'integer', example: 0 },
                        avgResponseMs: {
                            type: 'integer',
                            example: 12,
                            nullable: true,
                        },
                    },
                },
                HeartbeatTimeSeries: {
                    type: 'object',
                    properties: {
                        monitorId: {
                            type: 'string',
                            example: 'was-192-168-0-10',
                        },
                        name: { type: 'string', example: 'WAS 192.168.0.10' },
                        type: {
                            type: 'string',
                            enum: ['http', 'tcp', 'icmp'],
                            example: 'http',
                        },
                        url: {
                            type: 'string',
                            example: 'http://192.168.0.10:8080/health',
                            nullable: true,
                        },
                        ip: {
                            type: 'string',
                            example: '192.168.0.10',
                            nullable: true,
                        },
                        timeSeries: {
                            type: 'array',
                            items: {
                                $ref: '#/components/schemas/HeartbeatTimePoint',
                            },
                        },
                    },
                },
                HeartbeatMonitor: {
                    type: 'object',
                    properties: {
                        monitorId: {
                            type: 'string',
                            example: 'was-192-168-0-10',
                        },
                        name: { type: 'string', example: 'WAS 192.168.0.10' },
                        type: {
                            type: 'string',
                            enum: ['http', 'tcp', 'icmp'],
                            example: 'http',
                        },
                        status: {
                            type: 'string',
                            enum: ['up', 'down'],
                            example: 'up',
                        },
                        url: {
                            type: 'string',
                            example: 'http://192.168.0.10:8080/health',
                            nullable: true,
                        },
                        ip: {
                            type: 'string',
                            example: '192.168.0.10',
                            nullable: true,
                        },
                        port: {
                            type: 'integer',
                            example: 8080,
                            nullable: true,
                        },
                        responseTimeMs: {
                            type: 'integer',
                            example: 12,
                            nullable: true,
                        },
                        httpStatus: {
                            type: 'integer',
                            example: 200,
                            nullable: true,
                        },
                        checkedAt: {
                            type: 'string',
                            example: '2026-05-27T18:42:46.644+09:00',
                        },
                        availabilityPct: {
                            type: 'integer',
                            example: 99,
                            nullable: true,
                        },
                    },
                },
                LogEntry: {
                    type: 'object',
                    properties: {
                        timestamp: {
                            type: 'string',
                            example: '2026-05-27T18:42:46.644+09:00',
                        },
                        level: { type: 'string', example: 'ERROR' },
                        message: {
                            type: 'string',
                            example: 'Connection refused',
                        },
                        parsedMessage: { type: 'string', nullable: true },
                        service: { type: 'string', nullable: true },
                        hostname: { type: 'string', nullable: true },
                        ip: { type: 'string', nullable: true },
                    },
                },
                ApiError: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: false },
                        error: {
                            type: 'string',
                            example: 'Server not found: 192.168.0.10',
                        },
                    },
                },
            },
            parameters: {
                timeRange: {
                    in: 'query',
                    name: 'timeRange',
                    schema: { type: 'string' },
                    description:
                        'Elasticsearch 날짜 수식 (예: now-15m, now-1h, now-24h)',
                },
                interval: {
                    in: 'query',
                    name: 'interval',
                    schema: { type: 'string' },
                    description: '시계열 집계 간격 (예: 1m, 5m, 1h)',
                },
                ipPath: {
                    in: 'path',
                    name: 'ip',
                    required: true,
                    schema: { type: 'string' },
                    description: '서버 IP 주소',
                    example: '192.168.0.10',
                },
            },
        },
    },
    apis: [
        path.join(__dirname, '../routes/*.ts'),
        path.join(__dirname, '../routes/*.js'),
    ],
};

export const swaggerSpec = swaggerJsdoc(options);
