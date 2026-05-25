import { Router, Request, Response } from 'express';
import metricsService from '../services/MetricsService';
import { asyncHandler } from '../middleware/errorHandler';
import { validateAnomalyDetection } from '../middleware/requestValidator';
import { ApiResponse } from '../types';

const router = Router();

/**
 * GET /api/metrics/anomaly/:metricType
 * 이상 감지 (CPU, Memory, Disk)
 */
router.get(
  '/anomaly/:metricType',
  validateAnomalyDetection,
  asyncHandler(async (req: Request, res: Response) => {
    const { metricType } = req.params;
    const { timeRange } = req.query;

    let result;
    switch (metricType) {
      case 'cpu':
        result = await metricsService.detectCpuAnomaly(timeRange as string);
        break;
      case 'memory':
        result = await metricsService.detectMemoryAnomaly(timeRange as string);
        break;
      case 'disk':
        result = await metricsService.detectDiskAnomaly(timeRange as string);
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid metric type'
        });
    }

    const response: ApiResponse = {
      success: true,
      data: result,
      meta: { total: result.length }
    };

    return res.json(response);
  })
);

/**
 * GET /api/metrics/anomaly
 * 모든 메트릭 이상 감지
 */
router.get(
  '/anomaly',
  asyncHandler(async (req: Request, res: Response) => {
    const timeRange = (req.query.timeRange as string) || 'now-5m';

    const [cpuAnomalies, memoryAnomalies, diskAnomalies] = await Promise.all([
      metricsService.detectCpuAnomaly(timeRange),
      metricsService.detectMemoryAnomaly(timeRange),
      metricsService.detectDiskAnomaly(timeRange)
    ]);

    const response: ApiResponse = {
      success: true,
      data: { cpu: cpuAnomalies, memory: memoryAnomalies, disk: diskAnomalies },
      meta: {
        total: cpuAnomalies.length + memoryAnomalies.length + diskAnomalies.length
      }
    };

    return res.json(response);
  })
);

export default router;
