import { Router, Request, Response } from 'express';
import alertMonitor from '../services/AlertMonitorService';
import notificationService from '../services/NotificationService';
import cmsRepository from '../repositories/CMSRepository';
import elasticsearchService from '../services/ElasticsearchService';
import { asyncHandler } from '../middleware/errorHandler';
import { ApiResponse } from '../types';

const router = Router();

/**
 * @swagger
 * /alerts/status:
 *   get:
 *     summary: 알람 모니터 상태 조회
 *     tags: [Alerts]
 *     responses:
 *       200:
 *         description: 현재 폴링 상태
 */
router.get('/status', (_req: Request, res: Response) => {
  return res.json({
    success: true,
    data: alertMonitor.getStatus()
  } as ApiResponse);
});

/**
 * @swagger
 * /alerts/diagnostic:
 *   get:
 *     summary: DB 연결 및 설정 진단
 *     description: |
 *       Oracle/MariaDB 연결 상태, 쿨다운 설정값, 채널 설정 여부를 반환합니다.
 *       서버 시작 후 설정이 올바른지 확인할 때 사용합니다.
 *     tags: [Alerts]
 *     responses:
 *       200:
 *         description: 진단 결과
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     db:
 *                       type: object
 *                       properties:
 *                         connected:    { type: boolean }
 *                         cooldownSecs: { type: integer }
 *                         error:        { type: string }
 *                     channels:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           type:       { type: string }
 *                           configured: { type: boolean }
 *                     recipients:
 *                       type: object
 *                       properties:
 *                         count: { type: integer }
 *                         note:  { type: string }
 */
router.get(
  '/diagnostic',
  asyncHandler(async (_req: Request, res: Response) => {
    // 1. DB 연결 + 쿨다운 조회
    let dbResult: { connected: boolean; cooldownMs?: number; error?: string };
    try {
      const cooldownMs = await cmsRepository.getCooldownMs();
      dbResult = { connected: true, cooldownMs };
    } catch (err: any) {
      dbResult = { connected: false, error: err.message };
    }

    // 2. 채널 설정 상태
    const channels = notificationService.getChannelStatus();

    // 3. 수신자 조회 (현재 구현 여부 확인)
    const recipients = await cmsRepository.getAlertRecipients();

    return res.json({
      success: true,
      data: {
        db: dbResult,
        channels,
        recipients: {
          count: recipients.length,
          note:  recipients.length === 0 ? '수신자 테이블 미구현 (CMSRepository TODO)' : '정상',
        },
      }
    } as ApiResponse);
  })
);

/**
 * @swagger
 * /alerts/cooldowns:
 *   get:
 *     summary: 쿨다운 중인 에러 패턴 목록
 *     tags: [Alerts]
 *     responses:
 *       200:
 *         description: 쿨다운 목록
 */
router.get('/cooldowns', (_req: Request, res: Response) => {
  const cooldowns = alertMonitor.getCooldowns();
  return res.json({
    success: true,
    data: cooldowns,
    meta: { total: cooldowns.length }
  } as ApiResponse);
});

/**
 * @swagger
 * /alerts/test:
 *   post:
 *     summary: 알람 발송 테스트
 *     description: |
 *       phones / emails를 직접 지정하면 DB 수신자 조회 없이 즉시 발송합니다.
 *       둘 다 생략하면 DB 수신자 대상으로 발송합니다.
 *     tags: [Alerts]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *                 example: 테스트 알람 메시지
 *               phones:
 *                 type: array
 *                 items: { type: string }
 *                 example: ['010-0000-0000']
 *               emails:
 *                 type: array
 *                 items: { type: string }
 *                 example: ['test@example.com']
 *     responses:
 *       200:
 *         description: 발송 완료
 */
router.post(
  '/test',
  asyncHandler(async (req: Request, res: Response) => {
    const message = (req.body?.message as string) || '[테스트] Elastic API 알람 정상 동작 확인';
    const phones  = req.body?.phones  as string[] | undefined;
    const emails  = req.body?.emails  as string[] | undefined;

    const isDirect = (phones?.length ?? 0) > 0 || (emails?.length ?? 0) > 0;

    if (isDirect) {
      await notificationService.notifyDirect(message, { phones, emails });
    } else {
      await notificationService.notify(message);
    }

    return res.json({
      success: true,
      data: {
        message,
        mode:   isDirect ? 'direct' : 'db',
        phones: phones ?? [],
        emails: emails ?? [],
      }
    } as ApiResponse);
  })
);

/**
 * @swagger
 * /alerts/peek:
 *   get:
 *     summary: 감시 인덱스 최근 로그 진단
 *     description: |
 *       알람 모니터가 감시 중인 인덱스에서 최근 문서를 가져와
 *       log_level 필드명·값과 실제 알람 쿼리 결과를 함께 반환합니다.
 *       alert가 동작하지 않을 때 원인 파악용으로 사용합니다.
 *     tags: [Alerts]
 *     parameters:
 *       - in: query
 *         name: timeRange
 *         schema: { type: string, default: now-5m }
 *       - in: query
 *         name: index
 *         schema: { type: string, default: (감시 인덱스 전체) }
 *         description: 특정 인덱스만 볼 때 (예&#58; logs-was-*)
 */
router.get(
  '/peek',
  asyncHandler(async (req: Request, res: Response) => {
    const timeRange = (req.query.timeRange as string) || 'now-5m';
    const status    = alertMonitor.getStatus();
    const index     = (req.query.index as string) || status.indices.join(',');

    // 1. 필터 없이 최근 문서 5건 (log_level 필드 실제 값 확인용)
    const rawQuery: any = {
      size: 5,
      sort: [{ '@timestamp': { order: 'desc' } }],
      query: { bool: { must: [{ range: { '@timestamp': { gte: timeRange } } }] } },
      _source: { includes: ['@timestamp', 'log_level', 'log.level', 'message', 'log_message', 'service_name', 'host.name'] },
    };

    // 2. 실제 알람 쿼리 (레벨 + 키워드 조건)
    const alertQuery: any = {
      size: 5,
      sort: [{ '@timestamp': { order: 'desc' } }],
      query: {
        bool: {
          must: [{ range: { '@timestamp': { gte: timeRange } } }],
          should: [
            { terms: { 'log_level.keyword': ['ERROR', 'ERR'] } },
            { terms: { 'log_level':         ['ERROR', 'ERR'] } },   // keyword 타입 필드 대응
            ...status.keywords.map((kw: string) => ({
              multi_match: { query: kw, fields: ['log_message', 'message'], type: 'phrase' },
            })),
          ],
          minimum_should_match: 1,
        },
      },
      _source: { includes: ['@timestamp', 'log_level', 'message', 'log_message', 'service_name', 'host.name'] },
    };

    const [rawRes, alertRes] = await Promise.all([
      elasticsearchService.search(rawQuery, index),
      elasticsearchService.search(alertQuery, index),
    ]);

    const toDoc = (hit: any) => {
      const s = hit._source;
      return {
        index:       hit._index,
        timestamp:   s['@timestamp'],
        log_level:   s['log_level'],           // 파싱된 레벨
        'log.level': s['log.level'],           // ECS 방식 레벨
        service:     s['service_name'],
        host:        s['host']?.name,
        message:     (s['log_message'] || s['message'] || '').slice(0, 120),
      };
    };

    const rawDocs   = rawRes.hits.hits.map(toDoc);
    const alertDocs = alertRes.hits.hits.map(toDoc);

    return res.json({
      success: true,
      data: {
        index,
        timeRange,
        raw: {
          total: typeof rawRes.hits.total === 'number' ? rawRes.hits.total : rawRes.hits.total?.value,
          docs:  rawDocs,
        },
        alertMatch: {
          total: typeof alertRes.hits.total === 'number' ? alertRes.hits.total : alertRes.hits.total?.value,
          docs:  alertDocs,
          note:  alertDocs.length === 0
            ? '알람 쿼리(log_level=ERROR/ERR 또는 키워드) 결과 없음 → 필드명·값 확인 필요'
            : '이 문서들이 다음 폴링에서 알람 대상',
        },
      }
    } as ApiResponse);
  })
);

export default router;
