export interface MetricData {
    timestamp: string;
    hostname: string;
    ip: string;
    cpu?: number;
    memory?: number;
    disk?: number;
    load1?: number;
    load5?: number;
    load15?: number;
}

export interface TimeSeriesData {
    timestamp: string;
    cpu: number;
    memory: number;
    disk: number;
    maxCpu: number;
    maxMemory: number;
}

export interface AnomalyData {
    ip: string;
    hostname: string;
    type: string;
    level: 'ERROR' | 'WARN' | 'INFO';
    faultType: string;
    faultLevel: string;
    remarks: string;
    regDt: string;
    value: number;
}

export interface ServerInfo {
    hostname: string;
    ip: string;
    os?: string;
    osVersion?: string;
    department?: string;
    serviceType?: string;
}

export interface QueryParams {
    hostname?: string;
    timeRange?: string;
    interval?: string;
    metricType?: string;
}

export interface PaginationParams {
    page?: number;
    limit?: number;
}

export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    meta?: {
        total?: number;
        page?: number;
        limit?: number;
        took?: number;
    };
}
