import { Pool } from 'pg';
import path from 'path';
import dotenv from 'dotenv';

// Muat variabel environment dari file .env di root
const rootEnv = path.resolve(__dirname, '../.env');
dotenv.config({ path: rootEnv });

const host = process.env.DB_HOST || '127.0.0.1';
const port = parseInt(process.env.DB_PORT || '5432', 10);
const database = process.env.DB_NAME || 'zoga_assistant';
const user = process.env.DB_USER || 'postgres';
const password = process.env.DB_PASSWORD || '';

console.log('---------------------------------------------------------');
console.log('🧪 PENGUJIAN KONEKSI DATABASE POSTGRESQL');
console.log('---------------------------------------------------------');
console.log(`Target Host     : ${host}:${port}`);
console.log(`Target Database : ${database}`);
console.log(`User            : ${user}`);
console.log('Mencoba menyambung ke server PostgreSQL...');

const pool = new Pool({
  host,
  port,
  database,
  user,
  password,
  connectionTimeoutMillis: 5000,
});

async function runTest() {
  const startTime = Date.now();
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time, version() as version;');
    const duration = Date.now() - startTime;
    
    console.log('\n✅ KONEKSI BERHASIL!');
    console.log(`Waktu Respons   : ${duration} ms`);
    console.log(`Waktu Database  : ${result.rows[0].current_time}`);
    console.log(`Versi Engine    : ${result.rows[0].version}`);
    console.log('---------------------------------------------------------');
    
    client.release();
    await pool.end();
    process.exit(0);
  } catch (err: any) {
    console.error('\n❌ KONEKSI GAGAL!');
    console.error(`Pesan Error     : ${err.message}`);
    console.error('\nPetunjuk Perbaikan:');
    console.error('1. Pastikan service PostgreSQL sudah berjalan di server (contoh: sudo systemctl status postgresql).');
    console.error('2. Pastikan kredensial di file .env (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD) sudah benar.');
    console.error(`3. Pastikan database "${database}" sudah dibuat (contoh: CREATE DATABASE ${database};).`);
    console.error('---------------------------------------------------------');
    
    await pool.end();
    process.exit(1);
  }
}

runTest();
