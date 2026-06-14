GET /api/logs/services

GET /api/logs/services
GET /api/logs/:serviceName

# WAS 서비스 최근 1시간 로그

GET /api/logs/was?timeRange=now-1h&page=1&limit=50

# CXF 서비스 ERROR만, 오늘 기준 6시간

GET /api/logs/cxf?timeRange=now-6h&level=ERROR&limit=100

# ERROR + WARN 동시 필터

GET /api/logs/ingest_system?timeRange=now-3h&level=ERROR,WARN&page=2&limit=50

# 키워드 검색 (log_message 전문검색)

GET /api/logs/was?timeRange=now-24h&keyword=NullPointerException&limit=20

# 키워드 + 레벨 조합

GET /api/logs/system_manager?timeRange=now-1h&level=ERROR&keyword=connection+refused
GET /api/logs/:serviceName/errors

# WAS 에러/경고 최근 1시간

GET /api/logs/was/errors?timeRange=now-1h&page=1&limit=50

# Playout 에러 최근 30분

GET /api/logs/playout_system_error/errors?timeRange=now-30m

# Ingest 에러 어제 하루치 (2페이지)

GET /api/logs/ingest_system_error/errors?timeRange=now-24h&page=2&limit=100
응답 예시

{
"success": true,
"data": [
{
"timestamp": "2026-06-14T10:23:45.000+09:00",
"level": "ERROR",
"message": "원본 전체 메시지",
"parsedMessage": "파싱된 로그 메시지",
"logTime": "10:23:45:000",
"service": "was",
"module": "ClassName",
"hostname": "WAS-SERVER-01",
"ip": "192.168.0.10"
}
],
"meta": {
"total": 120,
"page": 1,
"limit": 50,
"totalPages": 3,
"serviceName": "was"
}
}
timeRange 형식 참고
값 의미
now-5m 최근 5분
now-1h 최근 1시간
now-6h 최근 6시간
now-24h 최근 24시간
now-7d 최근 7일
