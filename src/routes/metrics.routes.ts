import { Router, Request, Response } from 'express';
import metricsService from '../services/MetricsService';
import { asyncHandler } from '../middleware/errorHandler';
import { validateAnomalyDetection } from '../middleware/requestValidator';
import { ApiResponse } from '../types';

const router = Router();

/**
 * @swagger
 * /metrics/anomaly/{metricType}:
 *   get:
 *     summary: 메트릭 타입별 이상 감지
 *     tags: [Metrics]
 *     parameters:
 *       - in: path
 *         name: metricType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [cpu, memory, disk]
 *         description: 감지할 메트릭 타입
 *       - in: query
 *         name: timeRange
 *         schema: { type: string, default: now-5m }
 *         description: 조회 시간 범위
 *     responses:
 *       200:
 *         description: 임계치 초과 서버 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AnomalyData'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total: { type: integer, example: 2 }
 *       400:
 *         description: 유효하지 않은 metricType
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
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
 * @swagger
 * /metrics/anomaly:
 *   get:
 *     summary: CPU / Memory / Disk 전체 이상 감지
 *     tags: [Metrics]
 *     parameters:
 *       - in: query
 *         name: timeRange
 *         schema: { type: string, default: now-5m }
 *         description: 조회 시간 범위
 *     responses:
 *       200:
 *         description: 메트릭 타입별 이상 감지 결과
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     cpu:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/AnomalyData'
 *                     memory:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/AnomalyData'
 *                     disk:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/AnomalyData'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total: { type: integer, example: 3 }
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
