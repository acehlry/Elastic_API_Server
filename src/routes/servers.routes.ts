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
 * GET /api/servers
 * 전체 서버 목록 + 현재 리소스 (CPU, memory, disk, heartbeat)
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
 * GET /api/servers/:ip/metrics/latest
 * 서버의 최신 메트릭 조회
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
 * GET /api/servers/:ip/metrics/timeseries
 * 서버의 시계열 메트릭 조회
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

/**
 * POST /api/servers/metrics/batch
 * 다중 서버 메트릭 조회
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
 * GET /api/servers/:ip
 * 서버 상세 정보 (최신 메트릭 + 1시간 시계열)
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

export default router;
