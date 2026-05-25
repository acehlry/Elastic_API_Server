export interface SearchQuery {
    size?: number;
    from?: number;
    query: {
        bool: {
            must: Array<Record<string, any>>;
            should?: Array<Record<string, any>>;
            filter?: Array<Record<string, any>>;
        };
    };
    aggs?: Record<string, any>;
    sort?: Array<Record<string, any>>;
    _source?: {
        includes?: string[];
        excludes?: string[];
    };
}

export interface SearchResponse<T = any> {
    took: number;
    timed_out: boolean;
    hits: {
        total: {
            value: number;
            relation: string;
        };
        hits: Array<{
            _index: string;
            _id: string;
            _score: number;
            _source: T;
        }>;
    };
    aggregations?: Record<string, any>;
}

export interface Bucket {
    key: string | number;
    key_as_string?: string;
    doc_count: number;
    [key: string]: any;
}

export interface AggregationResponse {
    buckets: Bucket[];
    doc_count_error_upper_bound?: number;
    sum_other_doc_count?: number;
}
