# 알람 모니터 설정 가이드

Elasticsearch 로그를 주기적으로 폴링하여 조건에 맞는 로그 감지 시 SMS·이메일로 알람을 발송하는 시스템입니다.

---

## 목차

1. [동작 흐름](#1-동작-흐름)
2. [서비스별 감지 조건 설정](#2-서비스별-감지-조건-설정-alert-servicesjson)
3. [환경변수 설정](#3-환경변수-설정-env)
4. [DB 설정](#4-db-설정)
5. [발송 채널 설정](#5-발송-채널-설정)
6. [알람 메시지 형식](#6-알람-메시지-형식)
7. [쿨다운(중복 억제) 동작](#7-쿨다운중복-억제-동작)
8. [진단 및 테스트 API](#8-진단-및-테스트-api)

---

## 1. 동작 흐름

```
[서버 시작]
    │
    ├─ DB 조회: 쿨다운 시간 (TCS_CODE_COMPANY, HCODE=CPAM011, DCODE=SYS72)
    │
    └─ 폴링 루프 시작 (ALERT_POLL_MS 간격)
           │
           ├─ ES 조회: 마지막 폴링 이후 신규 로그
           │    └─ 서비스별 독립 조건으로 쿼리
           │         (service_name 필터 + 레벨 OR 키워드)
           │
           ├─ 감지된 로그 각각에 대해:
           │    ├─ 쿨다운 키 확인 (hostname + service + 정규화 메시지)
           │    ├─ 쿨다운 중 → 건수만 카운트, 발송 안 함
           │    └─ 쿨다운 아님 → DB에서 수신자 조회 → SMS/이메일 발송
           │
           └─ 다음 폴링 대기
```

---

## 2. 서비스별 감지 조건 설정 (`alert-services.json`)

경로: `src/config/alert-services.json`

서비스마다 감지할 **로그 레벨**과 **키워드**를 독립적으로 설정합니다.  
서버 재시작 없이 파일을 수정해도 **다음 서버 시작 시 반영**됩니다.

### 구조

```json
{
  "services": [
    {
      "name":     "서비스명 (ES service_name 필드값과 일치해야 함)",
      "index":    "ES 인덱스 패턴",
      "levels":   ["감지할 로그 레벨 배열"],
      "keywords": ["감지할 키워드 배열 (없으면 빈 배열)"]
    }
  ]
}
```

### 현재 설정

| 서비스 | 인덱스 | 감지 레벨 | 감지 키워드 |
|---|---|---|---|
| `was` | `logs-was-*` | ERROR, ERR | OutOfMemoryError, NullPointerException, Connection refused |
| `cxf` | `logs-cxf-*` | ERROR, ERR | - |
| `ingest_system_error` | `logs-ingest_system_error-*` | ERROR, ERR | no_signal |
| `playout_system_error` | `logs-playout_system_error-*` | ERROR, ERR | ERROR |
| `system_manager` | `logs-system_manager-*` | ERROR, ERR | - |
| `imedia_processor` | `logs-imedia_processor-*` | ERROR, ERR | - |

### 감지 조건 설명

- **levels**: ES `log_level` 필드 값과 대조합니다. 로그 레벨이 일치하면 알람.
- **keywords**: `log_message` 또는 `message` 필드에서 구문 검색(phrase match)합니다. 레벨과 OR 조건이므로 레벨이 INFO여도 키워드가 포함되면 알람.

### 서비스 추가 예시

```json
{
  "name": "upload",
  "index": "logs-upload-*",
  "levels": ["ERROR", "ERR", "WARN"],
  "keywords": ["disk full", "upload failed"]
}
```

---

## 3. 환경변수 설정 (`.env`)

### 폴링 간격

```env
# 단위: ms (기본값 30000 = 30초)
ALERT_POLL_MS=30000
```

> 쿨다운 시간은 `.env`가 아닌 DB에서 가져옵니다 → [4. DB 설정](#4-db-설정) 참고

---

## 4. DB 설정

알람 관련 설정값과 수신자 목록을 DB에서 조회합니다.

### DB 종류 선택

```env
# mariadb 또는 oracle
NOTIFY_DB_TYPE=oracle
```

### MariaDB 연결

```env
MARIADB_HOST=localhost
MARIADB_PORT=3306
MARIADB_USER=
MARIADB_PASSWORD=
```

### Oracle 연결

```env
ORACLE_USER=CMS
ORACLE_PASSWORD=cms
ORACLE_CONNECT=192.168.0.157:1521/LGHV_NEW
```

---

### 4-1. 쿨다운 시간 설정

같은 서비스의 동일 에러가 반복 발생해도 쿨다운 시간이 지나기 전까지는 재발송하지 않습니다.

| 구분 | 내용 |
|---|---|
| 테이블 | `CMS.TCS_CODE_COMPANY` |
| 조건 | `HCODE = 'CPAM011' AND DCODE = 'SYS72'` |
| 사용 필드 | `PARAM1` (단위: **ms**) |
| 기본값 | 3,600,000ms (1시간) — DB 조회 실패 시 |

DB 조회 실패 시 기본값(1시간)을 사용하고 서버는 정상 동작합니다.

---

### 4-2. 수신자 설정

알람 발송 대상을 DB에서 조회합니다.

| DB 종류 | 테이블 |
|---|---|
| MariaDB | `CMS.TCS_CODE` |
| Oracle | `CMS.TCS_CODE_COMPANY` |

**공통 조건**: `HCODE = 'CPAM094' AND DCODE = 'TEST'`

| 필드 | 용도 |
|---|---|
| `PARAM1` | 휴대폰 번호 (SMS 발송) |
| `PARAM2` | 이메일 주소 (이메일 발송) |

- `PARAM1`만 있으면 SMS만 발송
- `PARAM2`만 있으면 이메일만 발송
- 둘 다 있으면 SMS + 이메일 모두 발송
- 행이 여러 개이면 모두에게 발송

---

## 5. 발송 채널 설정

### SMS (SOLAPI)

```env
SMS_API_KEY=발급받은_API_KEY
SMS_API_SECRET=발급받은_API_SECRET
SMS_FROM=발신번호 (01012345678, 하이픈 없이)
```

- SOLAPI HMAC-SHA256 인증 방식 사용
- 발신번호는 SOLAPI 콘솔에서 사전 등록 필요
- 세 항목 중 하나라도 비어있으면 SMS 채널 비활성화

### 이메일 (SMTP)

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASS=password
SMTP_FROM=noreply@example.com
SMTP_SECURE=false   # true이면 465 포트 TLS 사용
```

- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` 중 하나라도 비어있으면 이메일 채널 비활성화
- Gmail 사용 시: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`

---

## 6. 알람 메시지 형식

```
[ERROR]
서비스: was
호스트: DESKTOP-6A9CEMV (192.168.0.10)
내용: java.lang.OutOfMemoryError: Java heap space at ...
(이전 3건 억제됨)
```

| 항목 | 내용 |
|---|---|
| 태그 | `[레벨]` 또는 `[키워드: 감지된키워드]` |
| 서비스 | ES `service_name` 필드 |
| 호스트 | ES `host.name` 필드 + IPv4 주소 (있을 경우) |
| 내용 | `log_message` 우선, 없으면 `message` / 최대 100자 |
| 억제 건수 | 쿨다운 중 발생한 동일 에러 누적 횟수 (있을 때만 표시) |

---

## 7. 쿨다운(중복 억제) 동작

### 쿨다운 키 구성

```
MD5(hostname + "::" + service + "::" + 정규화된_메시지)
```

**정규화 처리** (타임스탬프·UUID·숫자 제거로 동일 패턴 식별):
- UUID 형식 → `{UUID}`
- 날짜/시간 → `{TS}`, `{TIME}`
- 5자리 이상 숫자 → `{N}`
- 소스 라인 번호 (`:123)`) → `:N)`

### 억제 기준

| 조건 | 결과 |
|---|---|
| 같은 호스트 + 같은 서비스 + 같은 에러 패턴 | 쿨다운 동안 억제 |
| 같은 호스트 + **다른 서비스** + 같은 에러 패턴 | 별도 알람 발송 |
| 같은 호스트 + 같은 서비스 + **다른 에러 패턴** | 별도 알람 발송 |

쿨다운이 만료되면 억제된 건수와 함께 다음 알람에 포함됩니다.

---

## 8. 진단 및 테스트 API

### 현재 상태 확인

```http
GET /api/alerts/status
```

```json
{
  "running": true,
  "lastPollAt": "2026-06-15 10:00:00",
  "nextPollAt": "2026-06-15 10:00:30",
  "cooldownCount": 2,
  "pollIntervalMs": 30000,
  "cooldownMs": 3600000,
  "services": [
    { "name": "was", "index": "logs-was-*", "levels": ["ERROR","ERR"], "keywords": ["OutOfMemoryError"] }
  ]
}
```

---

### DB 연결 · 채널 · 수신자 진단

```http
GET /api/alerts/diagnostic
```

서버 설정이 올바른지 한 번에 확인합니다.

```json
{
  "db": { "connected": true, "cooldownMs": 3600000 },
  "channels": [
    { "type": "sms",   "configured": true  },
    { "type": "email", "configured": false }
  ],
  "recipients": { "count": 1, "note": "정상" }
}
```

---

### 쿨다운 목록 확인

```http
GET /api/alerts/cooldowns
```

현재 억제 중인 에러 패턴과 억제 건수를 확인합니다.

```json
[
  {
    "hostname": "DESKTOP-6A9CEMV",
    "service": "was",
    "triggerType": "level",
    "suppressedCount": 5,
    "firstSeenAt": "2026-06-15 09:00:00",
    "expiresAt": "2026-06-15 10:00:00"
  }
]
```

---

### ES 로그 실시간 진단 (알람이 안 올 때)

```http
GET /api/alerts/peek?timeRange=now-5m
GET /api/alerts/peek?timeRange=now-10m&service=was
```

| 파라미터 | 설명 | 기본값 |
|---|---|---|
| `timeRange` | 조회 시간 범위 | `now-5m` |
| `service` | 특정 서비스만 조회 | 전체 서비스 |
| `index` | 인덱스 직접 지정 | 설정된 전체 인덱스 |

응답에 `raw` (필터 없는 최근 5건)와 `alertMatch` (실제 알람 쿼리 결과)가 함께 반환됩니다.  
`alertMatch.total`이 0이면 ES 필드명·값을 확인해야 합니다.

---

### 알람 발송 테스트

수신자를 직접 지정하는 경우 (DB 수신자 무관):

```http
POST /api/alerts/test
Content-Type: application/json

{
  "message": "테스트 알람",
  "phones": ["01012345678"],
  "emails": ["test@example.com"]
}
```

DB 수신자 대상으로 발송 (phones/emails 생략):

```http
POST /api/alerts/test
Content-Type: application/json

{
  "message": "DB 수신자 대상 테스트"
}
```

---

## 문제 해결

### 알람이 전혀 오지 않을 때

1. `GET /api/alerts/status` → `running: true` 확인
2. `GET /api/alerts/peek?timeRange=now-10m` → `alertMatch.total` 확인
   - 0이면: ES `service_name` / `log_level` 필드 값 확인 필요
   - 1 이상이면: 발송 단계 문제
3. `GET /api/alerts/diagnostic` → DB 연결·수신자·채널 설정 확인
4. `POST /api/alerts/test` → 직접 번호로 테스트 발송

### 동일 에러인데 계속 알람이 올 때

`GET /api/alerts/cooldowns` 로 쿨다운이 정상 설정되어 있는지 확인합니다.  
쿨다운 시간은 DB `CMS.TCS_CODE_COMPANY (HCODE=CPAM011, DCODE=SYS72).PARAM1` 값(ms)입니다.

### 알람이 너무 안 올 때 (다른 서비스 에러도 억제됨)

서비스가 다르면 쿨다운 키가 달라 별도 발송되어야 합니다.  
`GET /api/alerts/cooldowns` 에서 `service` 필드가 올바르게 구분되어 있는지 확인합니다.
