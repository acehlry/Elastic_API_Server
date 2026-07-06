export interface MetricData {
    timestamp: string;
    hostname: string;
    ip: string;
    os?: string;
    osVersion?: string;
    cpu?: number;
    memory?: number;
    disk?: number;
    load1?: number;
    load5?: number;
    load15?: number;
    networkIn?: number;
    networkOut?: number;
}

export interface TimeSeriesData {
    timestamp: string;
    cpu: number;
    memory: number;
    disk: number;
    maxCpu: number;
    maxMemory: number;
    networkIn: number;
    networkOut: number;
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

export interface LogEntry {
    timestamp: string;
    level: string;
    message: string;
    logTime?: string;
    service?: string;
    module?: string;
    instance?: string;
    jobId?: string;
    hostname?: string;
    ip?: string;
    logFilePath?: string;
}

export interface LogPage {
    logs: LogEntry[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export interface ServerTimeSeries {
    hostname: string;
    ip: string;
    timeSeries: TimeSeriesData[];
}

export interface HeartbeatTimePoint {
    timestamp: string;
    status: 'up' | 'down' | 'mixed';
    upCount: number;
    downCount: number;
    avgResponseMs?: number;
}

export interface HeartbeatTimeSeries {
    monitorId: string;
    name: string;
    type: 'http' | 'tcp' | 'icmp';
    url?: string;
    ip?: string;
    timeSeries: HeartbeatTimePoint[];
}

export interface HeartbeatMonitor {
    monitorId: string;
    name: string;
    type: 'http' | 'tcp' | 'icmp';
    status: 'up' | 'down';
    url?: string;
    ip?: string;
    port?: number;
    responseTimeMs?: number;
    httpStatus?: number;
    checkedAt: string;
    availabilityPct?: number;
}

export interface HeartbeatEntry {
    hostname: string;
    ip: string;
    status: 'alive' | 'dead';
    lastSeen: string;
    cpu?: number;
    memory?: number;
    disk?: number;
}

export interface ServerOverview {
    hostname: string;
    ip: string;
    os?: string;
    osVersion?: string;
    heartbeat: 'alive' | 'dead';
    lastSeen: string;
    cpu?: number;
    memory?: number;
    disk?: number;
    load1?: number;
    load5?: number;
    load15?: number;
    networkIn?: number;
    networkOut?: number;
}

export interface QueryParams {
    ip?: string;
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
        [key: string]: any;
    };
}
