import { Router, Request, Response } from 'express';
import alertMonitor from '../services/AlertMonitorService';
import smsService from '../services/SmsService';
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     running:        { type: boolean }
 *                     lastPollAt:     { type: string }
 *                     nextPollAt:     { type: string }
 *                     cooldownCount:  { type: integer }
 *                     pollIntervalMs: { type: integer }
 *                     cooldownMs:     { type: integer }
 *                     indices:        { type: array, items: { type: string } }
 *                     smsConfigured:  { type: boolean }
 */
router.get('/status', (_req: Request, res: Response) => {
  return res.json({
    success: true,
    data: alertMonitor.getStatus()
  } as ApiResponse);
});

/**
 * @swagger
 * /alerts/cooldowns:
 *   get:
 *     summary: 쿨다운 중인 에러 패턴 목록
 *     description: 현재 중복 억제 중인 에러 패턴과 억제 횟수를 반환합니다.
 *     tags: [Alerts]
 *     responses:
 *       200:
 *         description: 쿨다운 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       hostname:        { type: string }
 *                       service:         { type: string }
 *                       normalizedMsg:   { type: string }
 *                       suppressedCount: { type: integer }
 *                       firstSeenAt:     { type: string }
 *                       lastSeenAt:      { type: string }
 *                       expiresAt:       { type: string }
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total: { type: integer }
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
 *     summary: SMS 테스트 발송
 *     description: 설정된 수신번호로 테스트 메시지를 발송합니다.
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
 *     responses:
 *       200:
 *         description: 발송 결과
 *       503:
 *         description: SMS 미설정
 */
router.post(
  '/test',
  asyncHandler(async (req: Request, res: Response) => {
    if (!smsService.isConfigured) {
      return res.status(503).json({
        success: false,
        error: 'SMS가 설정되지 않았습니다. .env의 SMS_API_URL, SMS_API_KEY, SMS_NUMBERS를 확인하세요.'
      });
    }

    const message = (req.body?.message as string) || '[테스트] Elastic API 알람 정상 동작 확인';
    await smsService.send(message);

    return res.json({
      success: true,
      data: { message }
    } as ApiResponse);
  })
);

export default router;
