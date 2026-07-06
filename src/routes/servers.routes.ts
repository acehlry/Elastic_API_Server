import { Router, Request, Response } from 'express';
import metricsService from '../services/MetricsService';
import { asyncHandler } from '../middleware/errorHandler';
import {
  validateTimeSeries,
  validateServerMetrics
} from '../middleware/requestValidator';
import { ApiResponse } from '../types';

const router = Router();

/**
 * @swagger
 * /servers:
 *   get:
 *     summary: 전체 서버 목록 + 현재 리소스 조회
 *     tags: [Servers]
 *     parameters:
 *       - $ref: '#/components/parameters/timeRange'
 *     responses:
 *       200:
 *         description: 서버 목록 (CPU / Memory / Disk / Heartbeat 포함)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ServerOverview'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total: { type: integer, example: 5 }
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const timeRange = (req.query.timeRange as string) || 'now-15m';

    const servers = await metricsService.getAllServers(timeRange);

    return res.json({
      success: true,
      data: servers,
      meta: { total: servers.length }
    } as ApiResponse);
  })
);

/**
 * @swagger
 * /servers/heartbeat:
 *   get:
 *     summary: 전체 서버 Heartbeat 상태 + 현재 리소스
 *     description: Metricbeat last_seen 기준으로 alive/dead 판정 (5분 기준). CPU, Memory, Disk 포함.
 *     tags: [Servers]
 *     parameters:
 *       - $ref: '#/components/parameters/timeRange'
 *     responses:
 *       200:
 *         description: Heartbeat 상태 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/HeartbeatEntry'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total: { type: integer, example: 5 }
 *                     alive: { type: integer, example: 4 }
 *                     dead:  { type: integer, example: 1 }
 */
router.get(
  '/heartbeat',
  asyncHandler(async (req: Request, res: Response) => {
    const timeRange = (req.query.timeRange as string) || 'now-15m';

    const data = await metricsService.getHeartbeat(timeRange);

    return res.json({
      success: true,
      data,
      meta: {
        total: data.length,
        alive: data.filter(s => s.status === 'alive').length,
        dead: data.filter(s => s.status === 'dead').length
      }
    } as ApiResponse);
  })
);

/**
 * @swagger
 * /servers/metrics/latest:
 *   get:
 *     summary: 전체 서버 최신 메트릭 조회
 *     tags: [Servers]
 *     parameters:
 *       - $ref: '#/components/parameters/timeRange'
 *     responses:
 *       200:
 *         description: 서버별 최신 메트릭 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/MetricData'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total: { type: integer, example: 5 }
 */
router.get(
  '/metrics/latest',
  asyncHandler(async (req: Request, res: Response) => {
    const timeRange = (req.query.timeRange as string) || 'now-15m';

    const metrics = await metricsService.getAllServersLatestMetrics(timeRange);

    return res.json({
      success: true,
      data: metrics,
      meta: { total: metrics.length }
    } as ApiResponse);
  })
);

/**
 * @swagger
 * /servers/metrics/timeseries:
 *   get:
 *     summary: 전체 서버 시계열 메트릭 조회
 *     tags: [Servers]
 *     parameters:
 *       - in: query
 *         name: timeRange
 *         schema: { type: string, default: now-1h }
 *         description: 조회 시간 범위 (예: now-1h, now-6h, now-24h)
 *       - $ref: '#/components/parameters/interval'
 *     responses:
 *       200:
 *         description: 서버별 시계열 데이터
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ServerTimeSeries'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total:     { type: integer, example: 5 }
 *                     timeRange: { type: string,  example: now-1h }
 *                     interval:  { type: string,  example: 5m }
 */
router.get(
  '/metrics/timeseries',
  asyncHandler(async (req: Request, res: Response) => {
    const timeRange = (req.query.timeRange as string) || 'now-1h';
    const interval = (req.query.interval as string) || '5m';

    const data = await metricsService.getAllServersTimeSeries(timeRange, interval);

    return res.json({
      success: true,
      data,
      meta: { total: data.length, timeRange, interval }
    } as ApiResponse);
  })
);

/**
 * @swagger
 * /servers/metrics/batch:
 *   post:
 *     summary: 다중 서버 메트릭 일괄 조회
 *     tags: [Servers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ips]
 *             properties:
 *               ips:
 *                 type: array
 *                 items: { type: string }
 *                 example: ['192.168.0.10', '192.168.0.11']
 *               timeRange:
 *                 type: string
 *                 example: now-1h
 *     responses:
 *       200:
 *         description: 요청한 서버들의 최신 메트릭
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/MetricData'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total:     { type: integer, example: 2 }
 *                     requested: { type: integer, example: 2 }
 *       400:
 *         description: ips 배열 누락
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
router.post(
  '/metrics/batch',
  asyncHandler(async (req: Request, res: Response) => {
    const { ips, timeRange } = req.body;

    if (!Array.isArray(ips) || ips.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'ips array is required'
      });
    }

    const metrics = await metricsService.getMultipleServerMetrics(
      ips,
      timeRange
    );

    return res.json({
      success: true,
      data: metrics,
      meta: {
        total: metrics.length,
        requested: ips.length
      }
    } as ApiResponse);
  })
);

/**
 * @swagger
 * /servers/{ip}:
 *   get:
 *     summary: 서버 상세 (최신 메트릭 + 1시간 시계열 + OS 정보)
 *     tags: [Servers]
 *     parameters:
 *       - $ref: '#/components/parameters/ipPath'
 *     responses:
 *       200:
 *         description: 서버 상세 정보
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     current:
 *                       $ref: '#/components/schemas/MetricData'
 *                     timeSeries:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/TimeSeriesData'
 *       404:
 *         description: 서버를 찾을 수 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
router.get(
  '/:ip',
  validateServerMetrics,
  asyncHandler(async (req: Request, res: Response) => {
    const { ip } = req.params;

    const [latestMetrics, timeSeriesData] = await Promise.all([
      metricsService.getLatestMetrics(ip),
      metricsService.getTimeSeriesData(ip, 'now-1h', '5m')
    ]);

    if (!latestMetrics) {
      return res.status(404).json({
        success: false,
        error: `Server not found: ${ip}`
      });
    }

    return res.json({
      success: true,
      data: {
        current: latestMetrics,
        timeSeries: timeSeriesData
      }
    } as ApiResponse);
  })
);

/**
 * @swagger
 * /servers/{ip}/metrics/latest:
 *   get:
 *     summary: 특정 서버 최신 메트릭 조회
 *     tags: [Servers]
 *     parameters:
 *       - $ref: '#/components/parameters/ipPath'
 *     responses:
 *       200:
 *         description: 최신 메트릭
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   $ref: '#/components/schemas/MetricData'
 *       404:
 *         description: 서버를 찾을 수 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
router.get(
  '/:ip/metrics/latest',
  validateServerMetrics,
  asyncHandler(async (req: Request, res: Response) => {
    const { ip } = req.params;

    const metrics = await metricsService.getLatestMetrics(ip);

    if (!metrics) {
      return res.status(404).json({
        success: false,
        error: `No metrics found for server: ${ip}`
      });
    }

    return res.json({
      success: true,
      data: metrics
    } as ApiResponse);
  })
);

/**
 * @swagger
 * /servers/{ip}/metrics/timeseries:
 *   get:
 *     summary: 특정 서버 시계열 메트릭 조회
 *     tags: [Servers]
 *     parameters:
 *       - $ref: '#/components/parameters/ipPath'
 *       - in: query
 *         name: timeRange
 *         schema: { type: string, default: now-1h }
 *         description: 조회 시간 범위
 *       - $ref: '#/components/parameters/interval'
 *     responses:
 *       200:
 *         description: 시계열 데이터
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/TimeSeriesData'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total:     { type: integer, example: 12 }
 *                     ip:        { type: string,  example: 192.168.0.10 }
 *                     timeRange: { type: string,  example: now-1h }
 *                     interval:  { type: string,  example: 5m }
 */
router.get(
  '/:ip/metrics/timeseries',
  validateTimeSeries,
  asyncHandler(async (req: Request, res: Response) => {
    const { ip } = req.params;
    const { timeRange, interval } = req.query;

    const timeSeries = await metricsService.getTimeSeriesData(
      ip,
      timeRange as string,
      interval as string
    );

    return res.json({
      success: true,
      data: timeSeries,
      meta: {
        total: timeSeries.length,
        ip,
        timeRange,
        interval
      }
    } as ApiResponse);
  })
);

export default router;
