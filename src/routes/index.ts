import { Router } from 'express';
import metricsRoutes from './metrics.routes';
import serversRoutes from './servers.routes';

const router = Router();

// Health check
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

export default router;