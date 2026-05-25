# 프로젝트 구조

```
ELATIC_API_SERVER
│
├── src/
│   ├── server.ts
│   ├── types/
│   │   ├── index.ts
│   │   ├── elasticsearch.types.ts
│   │   └── metrics.types.ts
│   ├── config/
│   │   ├── elasticsearch.ts
│   │   └── logger.ts
│   ├── queries/
│   │   ├── cpu-anomaly.json
│   │   ├── memory-anomaly.json
│   │   ├── disk-anomaly.json
│   │   ├── time-series.json
│   │   └── latest-metrics.json
│   ├── services/
│   │   ├── ElasticsearchService.ts
│   │   └── MetricsService.ts
│   ├── utils/
│   │   ├── QueryBuilder.ts
│   │   ├── Validator.ts
│   │   └── QueryTemplateLoader.ts
│   ├── routes/
│   │   ├── index.ts
│   │   ├── metrics.routes.ts
│   │   └── servers.routes.ts
│   └── middleware/
│       ├── errorHandler.ts
│       └── requestValidator.ts
├── .env
├── package.json
├── tsconfig.json
└── nodemon.json
```

# API

```
[전체 서버 목록]
GET	 /api/servers

[전체 서버 최신 메트릭]
GET	/api/servers/metrics/latest

[전체 서버 시계열 (서버별로 묶음)]
GET	/api/servers/metrics/timeseries

[서버 상세]
GET	 /api/servers/:ip

[최신 메트릭]
GET	 /api/servers/:ip/metrics/latest

[시계열]
GET	 /api/servers/:ip/metrics/timeseries

[다중 서버]
POST /api/servers/metrics/batch
{
    ips: [...]
}
```