import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import routes from './routes';
import { swaggerSpec } from './config/swagger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import logger from './config/logger';
import elasticsearchService from './services/ElasticsearchService';
import alertMonitor from './services/AlertMonitorService';
import notificationService from './services/NotificationService';

// 환경 변수 로드
dotenv.config();

class Server {
    public app: Application;
    private port: number;

    constructor() {
        this.app = express();
        this.port = parseInt(process.env.PORT || '3000');

        this.initializeMiddlewares();
        this.initializeRoutes();
        this.initializeErrorHandling();
    }

    private initializeMiddlewares(): void {
        // Security
        // upgrade-insecure-requests 제거: HTTP로 운영 시 Swagger UI 정적 파일이 HTTPS로
        // 리다이렉트되어 ERR_SSL_PROTOCOL_ERROR 발생하는 문제 방지
        this.app.use(
            helmet({
                contentSecurityPolicy: {
                    useDefaults: true,
                    directives: {
                        upgradeInsecureRequests: null,
                    },
                },
            }),
        );

        // CORS
        this.app.use(
            cors({
                origin: process.env.CORS_ORIGIN || '*',
                credentials: true,
            }),
        );

        // Body parsing
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));

        // Compression
        this.app.use(compression());

        // Request logging
        this.app.use((req: Request, _res: Response, next: NextFunction) => {
            logger.info(`${req.method} ${req.path}`, { query: req.query, ip: req.ip });
            next();
        });
    }

    private initializeRoutes(): void {
        // Swagger UI
        this.app.use( '/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
        this.app.get('/api-docs.json', (_req: Request, res: Response) => { res.json(swaggerSpec); });

        // API routes
        this.app.use('/api', routes);

        // Root endpoint - '/' 로 요청시 기본응답
        this.app.get('/', (_req: Request, res: Response) => {
            res.json({
                name: 'Elastic API',
                version: '1.0.0',
                status: 'running',
                endpoints: {
                    health: '/api/health',
                    metrics: '/api/metrics',
                    servers: '/api/servers',
                    heartbeat: '/api/heartbeat',
                    logs: '/api/logs',
                    alerts: '/api/alerts',
                },
            });
        });
    }

    private initializeErrorHandling(): void {
        // 404 handler
        this.app.use(notFoundHandler);

        // Error handler
        this.app.use(errorHandler);
    }

    public async start(): Promise<void> {
        try {
            // Elasticsearch 연결 확인
            const isHealthy = await elasticsearchService.healthCheck();
            if (!isHealthy) {
                throw new Error('Elasticsearch connection failed');
            }

            this.app.listen(this.port, () => {
                logger.info(`🚀 Server running on port ${this.port}`);
                logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
                logger.info(`🔍 Elasticsearch: ${process.env.ES_NODE}`);
                logger.info(`📡 API: http://localhost:${this.port}/api`);
            });

            // 알림 모니터링 실행부분
            // await alertMonitor.start();
        } catch (error) {
            logger.error('Failed to start server:', error);
            process.exit(1);
        }
    }

    public getApp(): Application {
        return this.app;
    }
}

// 서버 인스턴스 생성 및 시작
const server = new Server();
server.start();

// Graceful shutdown
const shutdown = async () => {
    // 알림 모니터링 종료
    alertMonitor.stop();
    await notificationService.close();
    process.exit(0);
};

// PM2 같은 프로세스 매니저 혹은 시스템이 프로세스 종료시 보내는 시그널
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    shutdown();
});

// 터미널에서 Ctrl + C를 눌렀을 때 발생하는 시그널
process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    shutdown();
});

export default server;
