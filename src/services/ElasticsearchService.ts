import { Client } from '@elastic/elasticsearch';
import esClient from '../config/elasticsearch';
import logger from '../config/logger';
import { SearchQuery, SearchResponse, Bucket } from '../types';

class ElasticsearchService {
    private client: Client;
    private indexPattern: string;

    constructor() {
        this.client = esClient;
        this.indexPattern = process.env.ES_INDEX_PATTERN || 'metricbeat-*';
    }

    /**
     * 기본 검색
     */
    async search<T = any>(
        query: SearchQuery,
        index?: string,
    ): Promise<SearchResponse<T>> {
        try {
            const startTime = Date.now();

            const response = await this.client.search({
                index: index || this.indexPattern,
                body: query,
            });

            const duration = Date.now() - startTime;
            logger.info(`Elasticsearch query executed in ${duration}ms`);

            return response as unknown as SearchResponse<T>;
        } catch (error) {
            logger.error('Elasticsearch query failed:', error);
            throw new Error(
                `Elasticsearch query failed: ${(error as Error).message}`,
            );
        }
    }

    /**
     * 스크롤 검색 (대용량 데이터)
     */
    async *scrollSearch<T = any>(
        query: SearchQuery,
        scrollTime: string = '2m',
        size: number = 1000,
    ): AsyncGenerator<Array<{ _source: T }>, void, unknown> {
        try {
            let response = (await this.client.search({
                index: this.indexPattern,
                scroll: scrollTime,
                size,
                body: query,
            })) as any;

            let scrollId = response._scroll_id;
            let hits = response.hits.hits;

            while (hits.length > 0) {
                yield hits as Array<{ _source: T }>;

                response = (await this.client.scroll({
                    scroll_id: scrollId,
                    scroll: scrollTime,
                })) as any;

                scrollId = response._scroll_id;
                hits = response.hits.hits;
            }

            if (scrollId) {
                await this.client.clearScroll({ scroll_id: scrollId });
            }
        } catch (error) {
            logger.error('Scroll search failed:', error);
            throw error;
        }
    }

    /**
     * 집계 결과 추출
     */
    extractAggregation(response: SearchResponse, aggName: string): any {
        return response.aggregations?.[aggName];
    }

    /**
     * 버킷 추출
     */
    extractBuckets(response: SearchResponse, aggName: string): Bucket[] {
        const agg = this.extractAggregation(response, aggName);
        return agg?.buckets || [];
    }

    /**
     * Hits 추출
     */
    extractHits<T = any>(response: SearchResponse<T>): T[] {
        return response.hits.hits.map((hit) => hit._source);
    }

    /**
     * 첫 번째 Hit 추출
     */
    extractFirstHit<T = any>(response: SearchResponse<T>): T | null {
        const hits = this.extractHits(response);
        return hits.length > 0 ? hits[0] : null;
    }

    /**
     * 헬스 체크
     */
    async healthCheck(): Promise<boolean> {
        try {
            await this.client.ping();
            return true;
        } catch (error) {
            logger.error('Elasticsearch health check failed:', error);
            return false;
        }
    }

    /**
     * 인덱스 존재 확인
     */
    async indexExists(index: string): Promise<boolean> {
        try {
            const result = await this.client.indices.exists({ index });
            return result as unknown as boolean;
        } catch (error) {
            logger.error(`Index exists check failed for ${index}:`, error);
            return false;
        }
    }
}

export default new ElasticsearchService();
