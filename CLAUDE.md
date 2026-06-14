# 프로젝트 컨텍스트

## 프로젝트 개요
Elasticsearch 기반 로그 모니터링 시스템.
Filebeat로 각 서비스 로그를 수집 → ES에 저장 → Node.js API 서버로 조회/알림 처리.

---

## 인프라 구성

| 항목 | 값 |
|---|---|
| Elasticsearch | `https://192.168.0.142:9200` |
| Kibana | `https://192.168.0.142:5601` |
| ES 버전 | 8.0.0 |
| ES 계정 | `elastic` / `cismtech9720!` |
| SSL 검증 | 비활성화 (`ssl.verification_mode: none`) |
| 서버 OS | Linux (ES 서버) + Windows (각 서비스 서버) |

---

## 로그 수집 구조 (Filebeat)

### 인덱스 패턴
`logs-{service_name}-YYYY.MM.DD`

### 서비스별 service_name 목록

| service_name | 설명 | 로그 형식 |
|---|---|---|
| `was` | WAS (Tomcat/Spring, 포트 8090) | `YYYY-MM-DD HH:mm:ss,SSS LEVEL [thread] (Class.java:line) - message` |
| `cxf` | CXF Web Service (포트 6081) | 위와 동일, SQL 블록 멀티라인 |
| `upload` | 업로드 서비스 (포트 6082) | 위와 동일 |
| `device` | 장치 상태 (EUC-KR) | `device_name \| HH:MM:SS:FF \| message` |
| `smc` | SMC (EUC-KR) | `[ERR] HH:MM:SS:FF CH-1 : message` |
| `system_manager` | SystemManager | `HH:MM:SS.mmm  [LEV] [ INSTANCE ] message` |
| `imedia_processor` | iMediaProcessor | `HH:MM:SS.mmm  [   ] [GUID32자] message` |
| `ingest_cms` | Ingest CMS | `HH:MM:SS:FF : [LEVEL] [MODULE] message` |
| `ingest_cmslocal` | Ingest CMSLocal | 위와 동일 |
| `ingest_system` | Ingest System | 위와 동일 |
| `ingest_nosignal` | Ingest NoSignal | 위와 동일 |
| `ingest_system_error` | Ingest 에러 (멀티라인) | 위와 동일 + 다음 줄에 경로 |
| `playout_system` | Playout 운영 (EPlayer) | `HH:MM:SS:FF : [LEVEL] message` |
| `playout_system_error` | Playout 에러 (멀티라인) | 위와 동일 + 다음 줄에 경로 |

### ES에서 파싱된 주요 필드
- `@timestamp` - 수집 시각
- `service_name` - 서비스 구분
- `log_level` - 로그 레벨 (ERROR, WARN, INFO 등)
- `log_message` - 실제 로그 메시지
- `log_time` - 원본 로그 타임스탬프
- `log_module` - 모듈명 (일부 서비스)
- `log_instance` - 인스턴스명 (SystemManager)
- `log_job_id` - Job GUID (iMediaProcessor)
- `host.name` - 수집 서버 호스트명
- `message` - 원본 전체 메시지

---

## Node.js API 서버

- **런타임**: Node.js
- **프레임워크**: Express
- **ES 클라이언트**: `@elastic/elasticsearch`
- **ES 연결 설정**:
```javascript
const client = new Client({
  node: 'https://192.168.0.142:9200',
  auth: { username: 'elastic', password: 'cismtech9720!' },
  tls: { rejectUnauthorized: false }
});
```

---

## 에러 알림 모듈 (alert-monitor.js)

### 구현 내용
- ES를 30초 간격으로 폴링하여 새 에러 감지
- 동일 서버 + 동일 에러 패턴 → 1시간 쿨다운 (중복 알림 방지)
- 쿨다운 중 억제된 횟수를 카운트하여 재발송 시 포함
- MD5 키로 에러 패턴 정규화 (타임스탬프·UUID 제거)
- SMS API로 알림 발송

### 현재 인덱스 설정 (수정 필요)
```javascript
// alert-monitor.js 에서 아래 인덱스로 수정해야 함
indices: [
  'logs-was-*',
  'logs-cxf-*',
  'logs-ingest_system_error-*',
  'logs-playout_system_error-*',
  'logs-system_manager-*',
  'logs-imedia_processor-*',
]
```

### SMS 발송 설정 (.env)
```
SMS_API_URL=https://your-sms-api.com/send
SMS_API_KEY=your_key_here
SMS_NUMBERS=010-0000-0000,010-1111-1111
ALERT_COOLDOWN_MS=3600000
ALERT_POLL_MS=30000
```

---

## 남은 개발 항목

1. **alert-monitor.js 인덱스 수정** - 위 인덱스 목록으로 업데이트
2. **SMS API 연동** - 실제 SMS 서비스 API 엔드포인트 연결
3. **기존 Node.js 서버에 alert-monitor 통합** - `alertMonitor.start()` 호출
4. **ES JVM 힙 메모리 설정** - OOM 재발 방지 (`/etc/elasticsearch/jvm.options`)
5. **Kibana 대시보드** - 서비스별 로그 모니터링 화면

---

## ILM (인덱스 자동 삭제)

- **정책명**: `logs-cleanup-policy`
- **보관 기간**: 30일 후 자동 삭제
- **적용 패턴**: `logs-*`
- **server-status 정책**: `server-status-cleanup-policy` (Metricbeat 데이터)

---

## 주의사항

- ES 서버 JVM 힙 메모리 미설정 시 OOM으로 ES 크래시 발생 이력 있음
- Filebeat 설정 변경 시 레지스트리 삭제 필요 (`C:\ProgramData\filebeat\data\registry`)
- SSL 인증서 검증 비활성화 상태로 운영 중
- Windows 서버 파일 경로는 대소문자 구분 없음
