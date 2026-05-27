import { Router, Request, Response } from 'express';
import heartbeatService from '../services/HeartbeatService';
import { asyncHandler } from '../middleware/errorHandler';
import { ApiResponse } from '../types';

const router = Router();

/**
 * @swagger
 * /heartbeat/monitors:
 *   get:
 *     summary: Elastic Heartbeat 전체 모니터 상태 조회
 *     description: |
 *       `heartbeat-*` 인덱스에서 모니터별 최신 up/down 상태를 반환합니다.
 *       Elastic Heartbeat가 설치되어 있어야 데이터가 조회됩니다.
 *     tags: [Heartbeat]
 *     parameters:
 *       - in: query
 *         name: timeRange
 *         schema: { type: string, default: now-5m }
 *         description: 조회 시간 범위
 *     responses:
 *       200:
 *         description: 모니터 상태 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/HeartbeatMonitor'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total: { type: integer, example: 3 }
 *                     up:    { type: integer, example: 2 }
 *                     down:  { type: integer, example: 1 }
 */
router.get(
  '/monitors',
  asyncHandler(async (req: Request, res: Response) => {
    const timeRange = (req.query.timeRange as string) || 'now-5m';

    const monitors = await heartbeatService.getMonitorStatus(timeRange);

    const up = monitors.filter(m => m.status === 'up').length;
    const down = monitors.filter(m => m.status === 'down').length;

    return res.json({
      success: true,
      data: monitors,
      meta: { total: monitors.length, up, down }
    } as ApiResponse);
  })
);

/**
 * @swagger
 * /heartbeat/monitors/timeseries:
 *   get:
 *     summary: 전체 모니터 시간대별 up/down 조회
 *     description: |
 *       모니터별로 지정한 시간 범위를 interval 단위 버킷으로 나눠 up/down 횟수와
 *       평균 응답시간을 반환합니다. status는 up / down / mixed 중 하나입니다.
 *     tags: [Heartbeat]
 *     parameters:
 *       - in: query
 *         name: timeRange
 *         schema: { type: string, default: now-1h }
 *         description: 조회 시간 범위 (예&#58; now-1h, now-6h, now-24h)
 *       - in: query
 *         name: interval
 *         schema: { type: string, default: 5m }
 *         description: 버킷 간격 (예&#58; 1m, 5m, 30m, 1h)
 *     responses:
 *       200:
 *         description: 모니터별 시계열 데이터
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/HeartbeatTimeSeries'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total:     { type: integer, example: 3 }
 *                     timeRange: { type: string,  example: now-1h }
 *                     interval:  { type: string,  example: 5m }
 */
router.get(
  '/monitors/timeseries',
  asyncHandler(async (req: Request, res: Response) => {
    const timeRange = (req.query.timeRange as string) || 'now-1h';
    const interval  = (req.query.interval  as string) || '5m';

    const data = await heartbeatService.getMonitorTimeSeries(timeRange, interval);

    return res.json({
      success: true,
      data,
      meta: { total: data.length, timeRange, interval }
    } as ApiResponse);
  })
);

/**
 * @swagger
 * /heartbeat/monitors/{monitorId}/timeseries:
 *   get:
 *     summary: 특정 모니터 시간대별 up/down 조회
 *     tags: [Heartbeat]
 *     parameters:
 *       - in: path
 *         name: monitorId
 *         required: true
 *         schema: { type: string }
 *         description: Heartbeat monitor.id
 *         example: was-192-168-0-10
 *       - in: query
 *         name: timeRange
 *         schema: { type: string, default: now-1h }
 *         description: 조회 시간 범위
 *       - in: query
 *         name: interval
 *         schema: { type: string, default: 5m }
 *         description: 버킷 간격
 *     responses:
 *       200:
 *         description: 해당 모니터의 시계열 데이터
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   $ref: '#/components/schemas/HeartbeatTimeSeries'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     timeRange: { type: string, example: now-1h }
 *                     interval:  { type: string, example: 5m }
 *       404:
 *         description: 모니터를 찾을 수 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
router.get(
  '/monitors/:monitorId/timeseries',
  asyncHandler(async (req: Request, res: Response) => {
    const { monitorId } = req.params;
    const timeRange = (req.query.timeRange as string) || 'now-1h';
    const interval  = (req.query.interval  as string) || '5m';

    const data = await heartbeatService.getMonitorTimeSeriesById(monitorId, timeRange, interval);

    if (!data) {
      return res.status(404).json({
        success: false,
        error: `Monitor not found: ${monitorId}`
      });
    }

    return res.json({
      success: true,
      data,
      meta: { timeRange, interval }
    } as ApiResponse);
  })
);

/**
 * @swagger
 * /heartbeat/monitors/by-ip/{ip}:
 *   get:
 *     summary: 서버 IP 기준 모니터 조회
 *     description: WAS 서버 IP로 연결된 Heartbeat 모니터를 조회합니다.
 *     tags: [Heartbeat]
 *     parameters:
 *       - $ref: '#/components/parameters/ipPath'
 *       - in: query
 *         name: timeRange
 *         schema: { type: string, default: now-5m }
 *         description: 조회 시간 범위
 *     responses:
 *       200:
 *         description: 해당 IP의 모니터 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/HeartbeatMonitor'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total: { type: integer, example: 1 }
 *                     ip:    { type: string,  example: 192.168.0.10 }
 */
router.get(
  '/monitors/by-ip/:ip',
  asyncHandler(async (req: Request, res: Response) => {
    const { ip } = req.params;
    const timeRange = (req.query.timeRange as string) || 'now-5m';

    const monitors = await heartbeatService.getMonitorsByIp(ip, timeRange);

    return res.json({
      success: true,
      data: monitors,
      meta: { total: monitors.length, ip }
    } as ApiResponse);
  })
);

/**
 * @swagger
 * /heartbeat/monitors/{monitorId}:
 *   get:
 *     summary: 특정 모니터 상태 조회
 *     tags: [Heartbeat]
 *     parameters:
 *       - in: path
 *         name: monitorId
 *         required: true
 *         schema: { type: string }
 *         description: Heartbeat monitor.id
 *         example: was-192-168-0-10
 *       - in: query
 *         name: timeRange
 *         schema: { type: string, default: now-5m }
 *         description: 조회 시간 범위
 *     responses:
 *       200:
 *         description: 모니터 상태
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   $ref: '#/components/schemas/HeartbeatMonitor'
 *       404:
 *         description: 모니터를 찾을 수 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
router.get(
  '/monitors/:monitorId',
  asyncHandler(async (req: Request, res: Response) => {
    const { monitorId } = req.params;
    const timeRange = (req.query.timeRange as string) || 'now-5m';

    const monitor = await heartbeatService.getMonitorById(monitorId, timeRange);

    if (!monitor) {
      return res.status(404).json({
        success: false,
        error: `Monitor not found: ${monitorId}`
      });
    }

    return res.json({ success: true, data: monitor } as ApiResponse);
  })
);

export default router;
