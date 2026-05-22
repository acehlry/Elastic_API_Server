import Joi from 'joi';
import { QueryParams } from '../types';

const schemas = {
    timeSeries: Joi.object({
        hostname: Joi.string().required(),
        timeRange: Joi.string()
            .pattern(/^now-\d+[mhd]$/)
            .default('now-1h'),
        interval: Joi.string()
            .valid('1m', '5m', '15m', '30m', '1h', '3h', '6h', '12h', '1d')
            .default('5m'),
    }),

    serverMetrics: Joi.object({
        hostname: Joi.string().required(),
    }),

    anomalyDetection: Joi.object({
        metricType: Joi.string().valid('cpu', 'memory', 'disk').required(),
        timeRange: Joi.string()
            .pattern(/^now-\d+[mhd]$/)
            .default('now-5m'),
    }),
};

export class ValidationError extends Error {
    statusCode: number;

    constructor(message: string) {
        super(message);
        this.name = 'ValidationError';
        this.statusCode = 400;
    }
}

export class Validator {
    static validate<T>(schema: Joi.ObjectSchema, data: any): T {
        const { error, value } = schema.validate(data, {
            abortEarly: false,
            stripUnknown: true,
        });

        if (error) {
            const messages = error.details.map((d) => d.message);
            throw new ValidationError(messages.join(', '));
        }

        return value as T;
    }

    static timeSeries(data: QueryParams): Required<QueryParams> {
        return this.validate<Required<QueryParams>>(schemas.timeSeries, data);
    }

    static serverMetrics(data: QueryParams): { hostname: string } {
        return this.validate<{ hostname: string }>(schemas.serverMetrics, data);
    }

    static anomalyDetection(
        data: QueryParams,
    ): Required<Pick<QueryParams, 'metricType' | 'timeRange'>> {
        return this.validate(schemas.anomalyDetection, data);
    }

    /**
     * 쿼리 크기 검증
     */
    static validateQuerySize(timeRange: string, interval: string): number {
        const maxBuckets = parseInt(process.env.MAX_QUERY_SIZE || '10000');
        const estimatedBuckets = this.estimateBucketCount(timeRange, interval);

        if (estimatedBuckets > maxBuckets) {
            throw new ValidationError(
                `쿼리 결과가 너무 큽니다. ` +
                    `예상 버킷 수: ${estimatedBuckets} (최대: ${maxBuckets}). ` +
                    `시간 범위를 줄이거나 interval을 늘려주세요.`,
            );
        }

        return estimatedBuckets;
    }

    static estimateBucketCount(timeRange: string, interval: string): number {
        const timeMatch = timeRange.match(/(\d+)([mhd])/);
        const intervalMatch = interval.match(/(\d+)([mhd])/);

        if (!timeMatch || !intervalMatch) {
            return 0;
        }

        const timeValue = parseInt(timeMatch[1]);
        const timeUnit = timeMatch[2];
        const intervalValue = parseInt(intervalMatch[1]);
        const intervalUnit = intervalMatch[2];

        const timeMinutes = this.toMinutes(timeValue, timeUnit);
        const intervalMinutes = this.toMinutes(intervalValue, intervalUnit);

        return Math.ceil(timeMinutes / intervalMinutes);
    }

    static toMinutes(value: number, unit: string): number {
        const multipliers: Record<string, number> = {
            m: 1,
            h: 60,
            d: 1440,
        };
        return value * (multipliers[unit] || 1);
    }
}
