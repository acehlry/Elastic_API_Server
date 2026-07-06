import { Router, Request, Response } from 'express';
import logService, { SERVICE_NAMES } from '../services/LogService';
import { asyncHandler } from '../middleware/errorHandler';
import { ApiResponse } from '../types';

const router = Router();

/**
 * @swagger
 * /logs/services:
 *   get:
 *     summary: 수집 서비스 목록 조회
 *     tags: [Logs]
 *     responses:
 *       200:
 *         description: 서비스명 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items: { type: string }
 *                   example: [was, cxf, upload]
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total: { type: integer, example: 14 }
 */
router.get('/services', (_req: Request, res: Response) => {
    return res.json({
        success: true,
        data: [...SERVICE_NAMES],
        meta: { total: SERVICE_NAMES.length },
    } as ApiResponse);
});

/**
 * @swagger
 * /logs/{serviceName}:
 *   get:
 *     summary: 서비스별 로그 페이징 조회
 *     description: |
 *       `logs-{serviceName}-*` 인덱스에서 로그를 조회합니다.
 *       serviceName 목록은 `/api/logs/services`에서 확인할 수 있습니다.
 *     tags: [Logs]
 *     parameters:
 *       - in: path
 *         name: serviceName
 *         required: true
 *         schema:
 *           type: string
 *           enum: [was, cxf, upload, device, smc, system_manager, imedia_processor, ingest_cms, ingest_cmslocal, ingest_system, ingest_nosignal, ingest_system_error, playout_system, playout_system_error]
 *         description: 서비스명
 *       - in: query
 *         name: timeRange
 *         schema: { type: string, default: now-1h }
 *         description: 조회 시간 범위
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *         description: 페이지 번호
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *         description: 페이지당 로그 수 (최대 200)
 *       - in: query
 *         name: level
 *         schema: { type: string }
 *         description: 로그 레벨 필터 (콤마 구분, 예&#58; ERROR,WARN)
 *       - in: query
 *         name: keyword
 *         schema: { type: string }
 *         description: log_message 키워드 검색
 *     responses:
 *       200:
 *         description: 로그 목록 (페이징)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/LogEntry'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total:       { type: integer, example: 120 }
 *                     page:        { type: integer, example: 1 }
 *                     limit:       { type: integer, example: 50 }
 *                     totalPages:  { type: integer, example: 3 }
 *                     serviceName: { type: string,  example: was }
 *       400:
 *         description: 유효하지 않은 서비스명
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
router.get(
    '/:serviceName',
    asyncHandler(async (req: Request, res: Response) => {
        const { serviceName } = req.params;

        // SEVICE_NAMES 배열에 servicename이 있는지 판별
        if (!(SERVICE_NAMES as readonly string[]).includes(serviceName)) {
            return res.status(400).json({
                success: false,
                error: `지정되지 않은 서비스명 입니다. 전달받은 서비스 명: ${serviceName}. 사용가능한 서비스 목록: ${SERVICE_NAMES.join(', ')}`,
            });
        }

        const timeRange = (req.query.timeRange as string) || 'now-1h';
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const keyword = (req.query.keyword as string) || undefined;
        const levels = (req.query.level as string)
            ?.split(',')
            .map((l) => l.trim())
            .filter(Boolean);
        const result = await logService.getServiceLogs(
            serviceName,
            timeRange,
            page,
            limit,
            levels,
            keyword,
        );

        return res.json({
            success: true,
            data: result.logs,
            meta: {
                total: result.total,
                page: result.page,
                limit: result.limit,
                totalPages: result.totalPages,
                serviceName,
            },
        } as ApiResponse);
    }),
);

/**
 * @swagger
 * /logs/{serviceName}/errors:
 *   get:
 *     summary: 서비스별 에러/경고 로그 조회
 *     description: ERROR, WARN, ERR 레벨 로그만 필터링하여 반환합니다.
 *     tags: [Logs]
 *     parameters:
 *       - in: path
 *         name: serviceName
 *         required: true
 *         schema: { type: string }
 *         description: 서비스명
 *       - in: query
 *         name: timeRange
 *         schema: { type: string, default: now-1h }
 *         description: 조회 시간 범위
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: 에러/경고 로그 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/LogEntry'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total:       { type: integer }
 *                     page:        { type: integer }
 *                     limit:       { type: integer }
 *                     totalPages:  { type: integer }
 *                     serviceName: { type: string }
 *       400:
 *         description: 유효하지 않은 서비스명
 */
router.get(
    '/:serviceName/errors',
    asyncHandler(async (req: Request, res: Response) => {
        const { serviceName } = req.params;

        if (!(SERVICE_NAMES as readonly string[]).includes(serviceName)) {
            return res.status(400).json({
                success: false,
                error: `Unknown service: ${serviceName}. Valid services: ${SERVICE_NAMES.join(', ')}`,
            });
        }

        const timeRange = (req.query.timeRange as string) || 'now-1h';
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;

        const result = await logService.getServiceLogs(
            serviceName,
            timeRange,
            page,
            limit,
            ['ERROR', 'WARN', 'ERR'],
        );

        return res.json({
            success: true,
            data: result.logs,
            meta: {
                total: result.total,
                page: result.page,
                limit: result.limit,
                totalPages: result.totalPages,
                serviceName,
            },
        } as ApiResponse);
    }),
);

export default router;
