const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * UTC 타임스탬프를 KST(+09:00)로 변환
 * 입력: "2026-05-27T09:42:46.644Z" → 출력: "2026-05-27T18:42:46.644+09:00"
 */
export const toKST = (utcStr: string): string => {
  if (!utcStr) return '';
  const d = new Date(utcStr);
  if (isNaN(d.getTime())) return utcStr;
  return new Date(d.getTime() + KST_OFFSET_MS)
    .toISOString()
    .replace('Z', '+09:00');
};

/**
 * epoch(ms) → KST ISO 문자열
 */
export const epochToKST = (epochMs: number): string => {
  if (!epochMs) return '';
  return new Date(epochMs + KST_OFFSET_MS)
    .toISOString()
    .replace('Z', '+09:00');
};

const TIME_UNIT_SECS: Record<string, number> = {
  s: 1, m: 60, h: 3600, d: 86400, w: 604800,
};

/**
 * Elasticsearch 시간 범위 문자열 → 초
 * 예: 'now-15m' → 900, 'now-1h' → 3600
 */
export const timeRangeToSeconds = (timeRange: string): number => {
  const match = timeRange.match(/now-(\d+)([smhdw])/);
  if (!match) return 900;
  return parseInt(match[1]) * (TIME_UNIT_SECS[match[2]] ?? 60);
};

/**
 * Elasticsearch 인터벌 문자열 → 초
 * 예: '5m' → 300, '1h' → 3600
 */
export const intervalToSeconds = (interval: string): number => {
  const match = interval.match(/^(\d+)([smhd])/);
  if (!match) return 300;
  return parseInt(match[1]) * (TIME_UNIT_SECS[match[2]] ?? 60);
};
