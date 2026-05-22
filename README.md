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
