# Elastic API Server

Elasticsearch 기반 서버 모니터링 · 로그 조회 · 에러 알람 API 서버.

---

## 목차

1. [설치 및 실행](#설치-및-실행)
2. [환경 변수](#환경-변수)
3. [API - 서버 모니터링](#api---서버-모니터링)
4. [API - 이상 감지](#api---이상-감지)
5. [API - Heartbeat 모니터](#api---heartbeat-모니터)
6. [API - 로그 조회](#api---로그-조회)
7. [API - 알람](#api---알람)
8. [알람 모니터 동작 방식](#알람-모니터-동작-방식)
9. [공통 파라미터](#공통-파라미터)
10. [PM2 배포](#pm2-배포)
11. [프로젝트 구조](#프로젝트-구조)

---

## 설치 및 실행

```sh
# 의존성 설치
npm install

# 개발 서버 (코드 변경 시 자동 재시작)
npm run dev

# 빌드
npm run build

# 프로덕션 실행
npm start
```

Swagger UI: `http://localhost:3000/api-docs`

---

## 환경 변수

`.env` 파일을 프로젝트 루트에 생성한다.

```env
NODE_ENV=development
PORT=3000

# Elasticsearch
ES_NODE=https://192.168.0.142:9200
ES_USERNAME=elastic
ES_PASSWORD=your_password
ES_INDEX_PATTERN=server-status-*
ES_SSL_ENABLED=true
ES_SSL_VERIFY=false

# 임계치 (0.0 ~ 1.0)
CPU_ERROR_THRESHOLD=0.8
CPU_WARN_THRESHOLD=0.7
MEMORY_ERROR_THRESHOLD=0.85
MEMORY_WARN_THRESHOLD=0.75
DISK_ERROR_THRESHOLD=0.9
DISK_WARN_THRESHOLD=0.8

# Heartbeat
HEARTBEAT_INDEX_PATTERN=heartbeat-*

# Alert Monitor
ALERT_POLL_MS=30000            # 폴링 간격 (ms), 기본 30초
ALERT_COOLDOWN_MS=3600000      # 쿨다운 (ms), 기본 1시간
ALERT_KEYWORDS=OutOfMemoryError,Connection refused,NullPointerException
# ALERT_INDICES=logs-was-*,logs-cxf-*,...  # 기본값 사용 시 주석 유지

# SMS
SMS_API_URL=https://your-sms-api.com/send
SMS_API_KEY=your_api_key
SMS_NUMBERS=010-0000-0000,010-1111-1111
```

> `ALERT_KEYWORDS`는 콤마로 구분하며 대소문자를 구분하지 않는다.
> SMS 설정이 없으면 알람 내용이 서버 로그에만 출력된다.

---

## API - 서버 모니터링

### 전체 서버 목록 + 현재 리소스

```
GET /api/servers?timeRange=now-15m
```

응답 필드: `hostname`, `ip`, `os`, `heartbeat(alive/dead)`, `lastSeen`, `cpu`, `memory`, `disk`, `load1/5/15`

---

### 전체 서버 Heartbeat 상태

```
GET /api/servers/heartbeat?timeRange=now-15m
```

---

### 전체 서버 최신 메트릭

```
GET /api/servers/metrics/latest?timeRange=now-15m
```

---

### 전체 서버 시계열

```
GET /api/servers/metrics/timeseries?timeRange=now-1h&interval=5m
```

---

### 다중 서버 일괄 조회

```
POST /api/servers/metrics/batch
Content-Type: application/json

{
  "ips": ["192.168.0.10", "192.168.0.11"],
  "timeRange": "now-1h"
}
```

---

### 서버 상세 (최신 메트릭 + 1시간 시계열)

```
GET /api/servers/192.168.0.10
```

---

### 특정 서버 최신 메트릭

```
GET /api/servers/192.168.0.10/metrics/latest
```

---

### 특정 서버 시계열

```
GET /api/servers/192.168.0.10/metrics/timeseries?timeRange=now-6h&interval=10m
```

---

### 특정 서버 로그

```
GET /api/servers/192.168.0.10/logs?timeRange=now-1h&page=1&limit=50&level=ERROR,WARN
```

| 파라미터 | 기본값 | 설명 |
|---|---|---|
| `timeRange` | `now-1h` | 조회 시간 범위 |
| `page` | `1` | 페이지 번호 |
| `limit` | `50` | 페이지당 건수 (최대 200) |
| `level` | - | 로그 레벨 필터 (콤마 구분) |

---

## API - 이상 감지

CPU / Memory / Disk 사용률이 임계치를 초과한 서버를 반환한다.  
임계치는 `.env`의 `*_ERROR_THRESHOLD`, `*_WARN_THRESHOLD`로 설정한다.

### 전체 메트릭 이상 감지

```
GET /api/metrics/anomaly?timeRange=now-5m
```

응답:
```json
{
  "success": true,
  "data": {
    "cpu":    [...],
    "memory": [...],
    "disk":   [...]
  }
}
```

---

### 타입별 이상 감지

```
GET /api/metrics/anomaly/cpu?timeRange=now-5m
GET /api/metrics/anomaly/memory?timeRange=now-5m
GET /api/metrics/anomaly/disk?timeRange=now-5m
```

응답 항목 예시:
```json
{
  "ip": "192.168.0.10",
  "hostname": "WAS-SERVER",
  "type": "CPU_HIGH",
  "level": "ERROR",
  "value": 87.5,
  "remarks": "CPU 사용률 87.5% 감지",
  "regDt": "2026-06-14T10:30:00.000+09:00"
}
```

---

## API - Heartbeat 모니터

Elastic Heartbeat (`heartbeat-*` 인덱스) 기반 HTTP/TCP 모니터 상태 조회.

### 전체 모니터 상태

```
GET /api/heartbeat/monitors?timeRange=now-5m
```

응답 항목: `monitorId`, `name`, `type`, `status(up/down)`, `url`, `responseTimeMs`, `httpStatus`, `availabilityPct`

---

### 특정 모니터 상태

```
GET /api/heartbeat/monitors/was-192-168-0-10?timeRange=now-5m
```

---

### IP 기준 모니터 조회

```
GET /api/heartbeat/monitors/by-ip/192.168.0.10?timeRange=now-5m
```

---

### 전체 모니터 시계열

```
GET /api/heartbeat/monitors/timeseries?timeRange=now-1h&interval=5m
```

버킷별 `status` 값:

| status | 의미 |
|---|---|
| `up` | 해당 구간 체크 전부 성공 |
| `down` | 해당 구간 체크 전부 실패 |
| `mixed` | 일부 성공, 일부 실패 (간헐적 장애) |

---

### 특정 모니터 시계열

```
GET /api/heartbeat/monitors/was-192-168-0-10/timeseries?timeRange=now-6h&interval=10m
```

---

## API - 로그 조회

Filebeat가 수집한 `logs-{서비스명}-YYYY.MM.DD` 인덱스를 서비스 단위로 조회한다.

### 수집 서비스 목록

```
GET /api/logs/services
```

응답:
```json
{
  "data": ["was", "cxf", "upload", "device", "smc", "system_manager",
           "imedia_processor", "ingest_cms", "ingest_cmslocal",
           "ingest_system", "ingest_nosignal", "ingest_system_error",
           "playout_system", "playout_system_error"]
}
```

---

### 서비스별 로그 조회

```
GET /api/logs/{serviceName}
```

| 파라미터 | 기본값 | 설명 |
|---|---|---|
| `timeRange` | `now-1h` | 조회 시간 범위 |
| `page` | `1` | 페이지 번호 |
| `limit` | `50` | 페이지당 건수 (최대 200) |
| `level` | - | 로그 레벨 필터 (콤마 구분) |
| `keyword` | - | `log_message` 전문 검색 |

```sh
# WAS 최근 1시간
GET /api/logs/was?timeRange=now-1h&page=1&limit=50

# CXF ERROR 6시간
GET /api/logs/cxf?timeRange=now-6h&level=ERROR

# ERROR + WARN 복수 필터
GET /api/logs/ingest_system?timeRange=now-3h&level=ERROR,WARN&page=2

# 키워드 검색
GET /api/logs/was?timeRange=now-24h&keyword=NullPointerException

# 키워드 + 레벨 조합
GET /api/logs/system_manager?timeRange=now-1h&level=ERROR&keyword=connection+refused
```

응답 항목:
```json
{
  "timestamp":     "2026-06-14T10:23:45.000+09:00",
  "level":         "ERROR",
  "message":       "원본 전체 메시지",
  "parsedMessage": "파싱된 로그 메시지",
  "logTime":       "10:23:45:000",
  "service":       "was",
  "module":        "ClassName",
  "instance":      "INSTANCE-01",
  "jobId":         "abc123",
  "hostname":      "WAS-SERVER-01",
  "ip":            "192.168.0.10"
}
```

---

### 서비스별 에러/경고 로그

`ERROR`, `WARN`, `ERR` 레벨만 필터링한 단축 엔드포인트.

```sh
# WAS 에러 최근 1시간
GET /api/logs/was/errors?timeRange=now-1h

# Playout 에러 최근 30분
GET /api/logs/playout_system_error/errors?timeRange=now-30m

# Ingest 에러 어제 하루치 2페이지
GET /api/logs/ingest_system_error/errors?timeRange=now-24h&page=2&limit=100
```

---

## API - 알람

### 알람 모니터 상태 조회

```
GET /api/alerts/status
```

응답:
```json
{
  "running":        true,
  "lastPollAt":     "2026-06-14T10:30:00.000+09:00",
  "nextPollAt":     "2026-06-14T10:30:30.000+09:00",
  "cooldownCount":  3,
  "pollIntervalMs": 30000,
  "cooldownMs":     3600000,
  "alertLevels":    ["ERROR", "ERR"],
  "keywords":       ["OutOfMemoryError", "Connection refused"],
  "smsConfigured":  true
}
```

---

### 쿨다운 중인 에러 패턴 목록

현재 중복 억제 중인 에러와 억제 횟수를 확인한다.

```
GET /api/alerts/cooldowns
```

응답 항목:
```json
{
  "hostname":        "WAS-SERVER-01",
  "service":         "was",
  "normalizedMsg":   "Connection reset by peer at {TS}",
  "triggerType":     "keyword",
  "matchedKeyword":  "Connection refused",
  "suppressedCount": 12,
  "firstSeenAt":     "2026-06-14T09:30:00.000+09:00",
  "lastSeenAt":      "2026-06-14T10:28:00.000+09:00",
  "expiresAt":       "2026-06-14T10:30:00.000+09:00"
}
```

---

### SMS 테스트 발송

```
POST /api/alerts/test
Content-Type: application/json

{
  "message": "테스트 알람 메시지"
}
```

> SMS 설정(`SMS_API_URL`, `SMS_API_KEY`, `SMS_NUMBERS`)이 없으면 `503` 반환.

---

## 알람 모니터 동작 방식

서버 시작 시 자동으로 시작되며 ES를 주기적으로 폴링한다.

```
[30초마다]
  ES 폴링 → 아래 조건 중 하나라도 해당하는 로그 최대 100건 감지

  감지 조건
  ├─ log_level = ERROR 또는 ERR
  └─ log_message / message 에 ALERT_KEYWORDS 포함 (대소문자 무시)

  감지 시
  ├─ 쿨다운 없음  → SMS 발송 + 1시간 쿨다운 등록
  ├─ 쿨다운 중    → 억제 카운트 증가 (발송 안 함)
  └─ 쿨다운 만료  → "이전 N건 억제됨" 포함하여 재발송
```

**SMS 메시지 형식:**

```
# 레벨 트리거
[ERROR] WAS-SERVER-01 / was
Connection reset by peer (이전 5건 억제됨)

# 키워드 트리거
[키워드: OutOfMemoryError] WAS-SERVER-01 / was
java.lang.OutOfMemoryError: Java heap space
```

**에러 패턴 정규화 (쿨다운 키 생성):**  
타임스탬프, UUID, 숫자 ID 등 가변 값을 `{TS}`, `{UUID}`, `{N}`으로 치환한 뒤 MD5 해시를 사용한다.  
같은 종류의 에러는 타임스탬프가 달라도 동일 패턴으로 인식한다.

**기본 감시 인덱스:**
```
logs-was-*
logs-cxf-*
logs-ingest_system_error-*
logs-playout_system_error-*
logs-system_manager-*
logs-imedia_processor-*
```

변경하려면 `.env`에 `ALERT_INDICES`를 콤마로 구분하여 지정한다.

---

## 공통 파라미터

### timeRange

| 값 | 의미 |
|---|---|
| `now-5m` | 최근 5분 |
| `now-15m` | 최근 15분 |
| `now-1h` | 최근 1시간 |
| `now-6h` | 최근 6시간 |
| `now-24h` | 최근 24시간 |
| `now-7d` | 최근 7일 |

### interval (시계열 버킷 크기)

| 값 | 적합한 timeRange |
|---|---|
| `1m` | now-1h 이하 |
| `5m` | now-1h ~ now-6h |
| `10m` | now-6h ~ now-12h |
| `30m` | now-12h ~ now-24h |
| `1h` | now-24h 이상 |

---

## PM2 배포

```sh
npm install -g pm2

# 빌드 후 실행
npm run build
pm2 start dist/server.js --name elastic-api

# 주요 명령어
pm2 list                        # 프로세스 목록
pm2 logs elastic-api            # 실시간 로그
pm2 logs elastic-api --lines 100
pm2 restart elastic-api         # 재시작
pm2 stop elastic-api            # 정지
pm2 delete elastic-api          # 목록 제거
pm2 monit                       # CPU/메모리 모니터

# 서버 재부팅 후 자동 시작
pm2 startup                     # 안내 명령어 출력 후 복붙 실행
pm2 save

# 코드 업데이트 배포
npm run build && pm2 restart elastic-api
```

---

## 프로젝트 구조

```
src/
├── server.ts
├── config/
│   ├── elasticsearch.ts
│   ├── logger.ts
│   └── swagger.ts
├── middleware/
│   ├── errorHandler.ts
│   └── requestValidator.ts
├── queries/                    # ES 쿼리 템플릿 (JSON)
│   ├── all-servers.json
│   ├── all-servers-timeseries.json
│   ├── cpu-anomaly.json
│   ├── memory-anomaly.json
│   ├── disk-anomaly.json
│   ├── heartbeat-status.json
│   ├── heartbeat-timeseries.json
│   ├── latest-metrics.json
│   ├── time-series.json
│   ├── server-logs.json
│   └── service-logs.json
├── routes/
│   ├── index.ts
│   ├── metrics.routes.ts
│   ├── servers.routes.ts
│   ├── heartbeat.routes.ts
│   ├── logs.routes.ts
│   └── alert.routes.ts
├── services/
│   ├── ElasticsearchService.ts
│   ├── MetricsService.ts
│   ├── HeartbeatService.ts
│   ├── LogService.ts
│   ├── AlertMonitorService.ts
│   └── SmsService.ts
├── types/
│   ├── index.ts
│   ├── elasticsearch.types.ts
│   └── metrics.types.ts
└── utils/
    ├── QueryBuilder.ts
    ├── QueryTemplateLoader.ts
    ├── Validator.ts
    └── dateUtils.ts
```
