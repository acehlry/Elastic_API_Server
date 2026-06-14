import { Router } from 'express';
import metricsRoutes from './metrics.routes';
import serversRoutes from './servers.routes';
import heartbeatRoutes from './heartbeat.routes';
import logsRoutes from './logs.routes';
import alertRoutes from './alert.routes';

const router = Router();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: API 서버 상태 확인
 *     tags: [System]
 *     responses:
 *       200:
 *         description: 정상 동작 중
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:   { type: boolean, example: true }
 *                 message:   { type: string, example: Metrics API is running }
 *                 timestamp: { type: string, example: '2026-05-27T18:42:46.644+09:00' }
 */
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'Metrics API is running',
    timestamp: new Date().toISOString()
  });
});

// Routes
router.use('/metrics', metricsRoutes);
router.use('/servers', serversRoutes);
router.use('/heartbeat', heartbeatRoutes);
router.use('/logs', logsRoutes);
router.use('/alerts', alertRoutes);

export default router;