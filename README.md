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

# API - 메트릭

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

# API - 로그

```
# 로그
GET /api/servers/192.168.0.10/logs?timeRange=now-1h&page=1&limit=50

# ERROR만
GET /api/servers/192.168.0.10/logs?level=error

# WARN, ERROR 복수
GET /api/servers/192.168.0.10/logs?level=warn,error

# INFO + 페이징 + 시간 범위
GET /api/servers/192.168.0.10/logs?level=info&timeRange=now-3h&page=2&limit=100
```

# 배포

## 서버 관리(PM2)

```sh
npm install -g pm2

# 빌드 먼저
npm run build

# PM2로 실행
pm2 start dist/server.js --name elastic-api

# 주요 명령어
## 실행 중인 프로세스 목록
pm2 list
## 실시간 로그
pm2 logs elastic-api
## 최근 100줄 로그
pm2 logs elastic-api --lines 100
## 재시작
pm2 restart elastic-api
## 정지
pm2 stop elastic-api
## 목록에서 제거
pm2 delete elastic-api
## CPU/메모리 실시간 모니터
pm2 monit

# 서버 재부팅 후 자동 시작 등록
## 안내 명령어 출력 (출력된 명령어 복붙해서 실행)
pm2 startup
## 현재 프로세스 목록 저장
pm2 save

# 코드 업데이트 시 배포
npm run build && pm2 restart elastic-api
```