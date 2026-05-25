import { Client, ClientOptions } from '@elastic/elasticsearch';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const buildClientOptions = (): ClientOptions => {
    const options: ClientOptions = {
        node: process.env.ES_NODE || 'http://localhost:9200',
        auth: {
            username: process.env.ES_USERNAME || 'elastic',
            password: process.env.ES_PASSWORD || 'changeme',
        },
        maxRetries: 5,
        requestTimeout: 60000,
    };

    if (process.env.ES_SSL_ENABLED === 'true') {
        const caPath = path.resolve(
            process.cwd(),
            process.env.ES_CA_CERT_PATH || './http_ca.crt',
        );
        const rejectUnauthorized = process.env.ES_SSL_VERIFY !== 'false';

        options.tls = {
            rejectUnauthorized,
            ...(fs.existsSync(caPath) && { ca: fs.readFileSync(caPath) }),
        };
    }

    return options;
};

const client = new Client(buildClientOptions());

client
    .ping()
    .then(() => console.log('✅ Elasticsearch connected'))
    .catch((err) => console.error('❌ Elasticsearch connection failed:', err));

export default client;
