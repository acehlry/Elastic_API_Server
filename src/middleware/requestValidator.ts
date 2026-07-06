import { Request, Response, NextFunction } from 'express';
import { Validator } from '../utils/Validator';

export const validateTimeSeries = ( req: Request, _res: Response, next: NextFunction ): void => {
    try {
        const validated = Validator.timeSeries({
            ip: req.params.ip,
            timeRange: req.query.timeRange as string,
            interval: req.query.interval as string
        });

        req.query = validated as any;
        next();
    } catch (error) {
        next(error);
    }
};

export const validateServerMetrics = ( req: Request, _res: Response, next: NextFunction ): void => {
    try {
        const validated = Validator.serverMetrics({
            ip: req.params.ip
        });

        req.params = validated as any;
        next();
    } catch (error) {
        next(error);
    }
};

export const validateAnomalyDetection = ( req: Request, _res: Response, next: NextFunction ): void => {
    try {
        const validated = Validator.anomalyDetection({
            metricType: req.params.metricType,
            timeRange: req.query.timeRange as string
        });

        req.params.metricType = validated.metricType;
        req.query.timeRange = validated.timeRange as any;
        next();
    } catch (error) {
        next(error);
    }
};