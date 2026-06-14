import mysql from 'mysql2/promise';
import oracledb from 'oracledb';
import { Recipient } from '../types/notification.types';
import logger from '../config/logger';

type DBType = 'mariadb' | 'oracle';

const DEFAULT_COOLDOWN_MS = 3600000;

class CMSRepository {
    private readonly dbType: DBType;
    private mariaPool?: mysql.Pool;
    private oraclePool?: oracledb.Pool;

    constructor() {
        this.dbType = (process.env.NOTIFY_DB_TYPE || 'mariadb') as DBType;
    }

    // ────────────────────────────────────────────
    // 알람 쿨다운 조회
    // CMS.TCS_CODE_COMPANY WHERE HCODE='CPAM011' AND DCODE='SYS72'
    // PARAM1 값(ms 단위)을 반환한다. 조회 실패 시 기본값 반환.
    // ────────────────────────────────────────────
    async getCooldownMs(): Promise<number> {
        try {
            const value =
                this.dbType === 'oracle'
                    ? await this.getCooldownOracle()
                    : await this.getCooldownMariaDB();

            if (value !== null) {
                logger.info(`[CMSRepository] 쿨다운: ${value}ms (DB)`);
                return value;
            }
        } catch (error) {
            logger.error(
                '[CMSRepository] 쿨다운 조회 실패, 기본값 사용:',
                error,
            );
        }

        logger.warn(
            `[CMSRepository] 쿨다운 기본값 사용: ${DEFAULT_COOLDOWN_MS}ms`,
        );
        return DEFAULT_COOLDOWN_MS;
    }

    // ────────────────────────────────────────────
    // 알람 수신자 조회
    // CMS.TCS_CODE WHERE HCODE='CPAM094' AND DCODE='TEST'
    // PARAM1: 핸드폰 번호 / PARAM2: 이메일
    // 추후 DCODE 조건 제거 → 시스템별 다수 담당자로 확장 예정
    // ────────────────────────────────────────────
    async getAlertRecipients(): Promise<Recipient[]> {
        try {
            return this.dbType === 'oracle'
                ? await this.getRecipientsOracle()
                : await this.getRecipientsMariaDB();
        } catch (error) {
            logger.error('[CMSRepository] 수신자 조회 실패:', error);
            return [];
        }
    }

    async close(): Promise<void> {
        if (this.mariaPool) {
            await this.mariaPool.end().catch(() => {});
            this.mariaPool = undefined;
        }
        if (this.oraclePool) {
            await this.oraclePool.close(0).catch(() => {});
            this.oraclePool = undefined;
        }
    }

    // ── MariaDB ──────────────────────────────────

    private getMariaPool(): mysql.Pool {
        if (!this.mariaPool) {
            this.mariaPool = mysql.createPool({
                host: process.env.MARIADB_HOST || 'localhost',
                port: parseInt(process.env.MARIADB_PORT || '3306'),
                user: process.env.MARIADB_USER || '',
                password: process.env.MARIADB_PASSWORD || '',
                waitForConnections: true,
                connectionLimit: 5,
                timezone: '+09:00',
            });
        }
        return this.mariaPool;
    }

    private async getCooldownMariaDB(): Promise<number | null> {
        const [rows] = await this.getMariaPool().query<mysql.RowDataPacket[]>(
            `SELECT param1 FROM CMS.TCS_CODE_COMPANY WHERE HCODE = ? AND DCODE = ?`,
            ['CPAM011', 'SYS72'],
        );
        const val = rows[0]?.param1;
        return val != null ? parseInt(val, 10) : null;
    }

    private async getRecipientsMariaDB(): Promise<Recipient[]> {
        const [rows] = await this.getMariaPool().query<mysql.RowDataPacket[]>(
            `SELECT DCODE, PARAM1, PARAM2
       FROM CMS.TCS_CODE
       WHERE HCODE = ? AND DCODE = ?`,
            ['CPAM094', 'TEST'],
        );
        return this.rowsToRecipients(
            rows.map((r) => ({
                DCODE: r.DCODE,
                PARAM1: r.PARAM1,
                PARAM2: r.PARAM2,
            })),
        );
    }

    // ── Oracle ───────────────────────────────────

    private async getOraPool(): Promise<oracledb.Pool> {
        if (!this.oraclePool) {
            this.oraclePool = await oracledb.createPool({
                user: process.env.ORACLE_USER || '',
                password: process.env.ORACLE_PASSWORD || '',
                connectString: process.env.ORACLE_CONNECT || '',
                poolMin: 1,
                poolMax: 5,
                poolIncrement: 1,
            });
        }
        return this.oraclePool;
    }

    private async getCooldownOracle(): Promise<number | null> {
        const conn = await (await this.getOraPool()).getConnection();
        try {
            const result = await conn.execute(
                `SELECT PARAM1 FROM CMS.TCS_CODE_COMPANY WHERE HCODE = :1 AND DCODE = :2`,
                ['CPAM011', 'SYS72'],
                { outFormat: oracledb.OUT_FORMAT_OBJECT },
            );
            const row = (result.rows as any[])?.[0];
            return row?.PARAM1 != null ? parseInt(row.PARAM1, 10) : null;
        } finally {
            await conn.close().catch(() => {});
        }
    }

    private async getRecipientsOracle(): Promise<Recipient[]> {
        const conn = await (await this.getOraPool()).getConnection();
        try {
            const result = await conn.execute(
                `SELECT DCODE, PARAM1, PARAM2
         FROM CMS.TCS_CODE_COMPANY
         WHERE HCODE = :1 AND DCODE = :2`,
                ['CPAM094', 'TEST'],
                { outFormat: oracledb.OUT_FORMAT_OBJECT },
            );
            return this.rowsToRecipients((result.rows as any[]) ?? []);
        } finally {
            await conn.close().catch(() => {});
        }
    }

    /**
     * TCS_CODE 행 배열 → Recipient 배열 변환
     * PARAM1(핸드폰) → sms, PARAM2(이메일) → email
     * 값이 없는 항목은 건너뜀
     */
    private rowsToRecipients(
        rows: { DCODE: string; PARAM1: string | null; PARAM2: string | null }[],
    ): Recipient[] {
        const recipients: Recipient[] = [];

        rows.forEach((row, i) => {
            const name = row.DCODE || `recipient-${i}`;

            if (row.PARAM1?.trim()) {
                recipients.push({
                    id: `${name}-sms`,
                    name,
                    channelType: 'sms',
                    target: row.PARAM1.trim(),
                });
            }
            if (row.PARAM2?.trim()) {
                recipients.push({
                    id: `${name}-email`,
                    name,
                    channelType: 'email',
                    target: row.PARAM2.trim(),
                });
            }
        });

        logger.info(`[CMSRepository] 수신자 ${recipients.length}명 조회 완료`);
        return recipients;
    }
}

export default new CMSRepository();
