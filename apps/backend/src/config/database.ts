import { Pool, PoolConfig } from 'pg';
import { env } from './env';
import { logger } from '../utils/logger';

const poolConfig: PoolConfig = {
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  max: env.DB_MAX_CONNECTIONS,
  idleTimeoutMillis: env.DB_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT_MS,
  statement_timeout: env.DB_STATEMENT_TIMEOUT_MS || undefined,
  ssl: env.DB_SSL ? { rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED } : undefined,
};

// Inisialisasi pool koneksi tunggal (singleton)
export const dbPool = new Pool(poolConfig);

dbPool.on('error', (err) => {
  logger.error({ err }, 'Terjadi error tidak terduga pada PostgreSQL idle client pool');
});

/**
 * Uji koneksi aktif ke PostgreSQL
 */
export const checkDatabaseHealth = async (): Promise<{ ok: boolean; message: string; timestamp?: string }> => {
  try {
    const client = await dbPool.connect();
    try {
      const result = await client.query('SELECT NOW() as now, version() as version;');
      return {
        ok: true,
        message: 'Koneksi PostgreSQL berhasil!',
        timestamp: result.rows[0].now,
      };
    } finally {
      client.release();
    }
  } catch (error: any) {
    logger.error({ error: error.message }, 'Gagal terhubung ke database PostgreSQL');
    return {
      ok: false,
      message: error.message || 'Koneksi database gagal',
    };
  }
};

/**
 * Graceful close pool database
 */
export const closeDatabasePool = async (): Promise<void> => {
  try {
    logger.info('Menutup pool koneksi database PostgreSQL...');
    await dbPool.end();
    logger.info('Pool database berhasil ditutup.');
  } catch (error) {
    logger.error({ error }, 'Error saat menutup pool database');
  }
};
