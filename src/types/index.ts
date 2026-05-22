export * from './elasticsearch.types';
export * from './metrics.types';

export interface MustClause {
    range?: Record<string, any>;
    term?: Record<string, any>;
    terms?: Record<string, any>;
    match?: Record<string, any>;
    exists?: { field: string };
}

export interface QueryBuilderParams {
    interval?: string;
    start_time?: string;
    end_time?: string;
    [key: string]: any;
}

export enum MetricType {
    CPU = 'cpu',
    MEMORY = 'memory',
    DISK = 'disk',
}

export enum AnomalyLevel {
    ERROR = 'ERROR',
    WARN = 'WARN',
    INFO = 'INFO',
}

export interface Thresholds {
    error: number;
    warning: number;
}
