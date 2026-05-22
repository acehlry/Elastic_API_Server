import { Client } from '@elastic/elasticsearch';
import dotenv from 'dotenv';
import { ElasticsearchConfig } from '../types';

dotenv.config();

const config: ElasticsearchConfig = {
    node: process.env.ES_NODE || 'http://localhost:9200',
    auth: {
        username: process.env.ES_USERNAME || 'elastic',
        password: process.env.ES_PASSWORD || 'changeme',
    },
    maxRetries: 5,
    requestTimeout: 60000,
};

const client = new Client({
    ...config,
    sniffOnStart: true,
    sniffInterval: 300000,
});

// 연결 테스트
client
    .ping()
    .then(() => console.log('✅ Elasticsearch connected'))
    .catch((err) => console.error('❌ Elasticsearch connection failed:', err));

export default client;
