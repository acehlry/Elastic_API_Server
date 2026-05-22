import fs from 'fs';
import path from 'path';
import { SearchQuery } from '../types';

class QueryTemplateLoader {
    private cache: Map<string, SearchQuery>;
    private templatesDir: string;

    constructor() {
        this.cache = new Map();
        this.templatesDir = path.join(__dirname, '../queries');
    }

    load(templateName: string): SearchQuery {
        // 캐시 확인
        if (this.cache.has(templateName)) {
            return JSON.parse(JSON.stringify(this.cache.get(templateName)));
        }

        // 파일 읽기
        const filePath = path.join(this.templatesDir, `${templateName}.json`);

        if (!fs.existsSync(filePath)) {
            throw new Error(`Query template not found: ${templateName}`);
        }

        const template = JSON.parse(
            fs.readFileSync(filePath, 'utf8'),
        ) as SearchQuery;

        // 캐싱
        this.cache.set(templateName, template);

        // 복사본 반환
        return JSON.parse(JSON.stringify(template));
    }

    clearCache(): void {
        this.cache.clear();
    }
}

export default new QueryTemplateLoader();
