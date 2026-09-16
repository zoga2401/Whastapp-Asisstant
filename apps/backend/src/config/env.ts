import { z } from 'zod';
import path from 'path';
import dotenv from 'dotenv';

// Muat file .env dari root project (dua tingkat ke atas dari apps/backend)
const rootEnvPath = path.resolve(__dirname, '../../../../.env');
dotenv.config({ path: rootEnvPath });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),

  // Database PostgreSQL
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string().min(1, 'DB_NAME wajib diisi'),
  DB_USER: z.string().min(1, 'DB_USER wajib diisi'),
  DB_PASSWORD: z.string().default(''),
  DB_MAX_CONNECTIONS: z.coerce.number().default(10),
  DB_IDLE_TIMEOUT_MS: z.coerce.number().default(30000),
  DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(5000),
  DB_SSL: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(false),
  DB_SSL_REJECT_UNAUTHORIZED: z.preprocess((val) => val !== 'false', z.boolean()).default(true),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(0).max(120000).default(30000),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_TO_FILE: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(true),
  LOG_FILE_PATH: z.string().default('../../logs/app.log'),

  // Admin & Security
  ADMIN_PHONE_NUMBER: z.string().optional(),
  ADMIN_SECRET_KEY: z.string().default('default_insecure_key_change_me'),
  ADMIN_TAKEOVER_TIMEOUT_MINUTES: z.coerce.number().default(30),
  ADMIN_DASHBOARD_USERNAME: z.string().default('admin'),
  ADMIN_DASHBOARD_PASSWORD_HASH: z.string().optional(),
  ADMIN_SESSION_TTL_MS: z.coerce.number().int().min(300000).default(28800000),

  // Context & Memory Configuration (Tahap 4)
  CONTEXT_MESSAGE_LIMIT: z.coerce.number().default(20),
  MEMORY_LIMIT: z.coerce.number().default(10),

  // AI Service (Ollama)
  OLLAMA_BASE_URL: z.string().url().default('http://127.0.0.1:11434'),
  OLLAMA_MODEL: z.string().default('qwen2.5:3b'),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(90000),
  AI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(1),
  AI_TEMPERATURE: z.coerce.number().min(0).max(1).default(0.3),

  // Stage 9: explicitly opt-in; conservative limits and kill switch.
  WHATSAPP_AUTO_REPLY_ENABLED: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(false),
  WHATSAPP_AUTO_REPLY_KILL_SWITCH: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(false),
  AUTO_REPLY_PER_CONTACT_PER_MINUTE: z.coerce.number().int().min(1).max(10).default(1),
  AUTO_REPLY_GLOBAL_PER_MINUTE: z.coerce.number().int().min(1).max(60).default(10),
  AUTO_REPLY_DEDUPE_TTL_MS: z.coerce.number().int().min(60000).max(86400000).default(86400000),
  AUTO_REPLY_TYPING_ENABLED: z.preprocess((val) => val !== 'false', z.boolean()).default(true),
  AUTO_REPLY_LOOP_WINDOW_MS: z.coerce.number().int().min(1000).max(86400000).default(600000),
  AUTO_REPLY_MAX_IN_FLIGHT_MS: z.coerce.number().int().min(1000).max(300000).default(60000),
  HEALTH_REQUIRE_WHATSAPP: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(false),
});

export type EnvConfig = z.infer<typeof envSchema>;

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ FATAL: Konfigurasi Environment (.env) Tidak Valid:');
  console.error(JSON.stringify(parsedEnv.error.format(), null, 2));
  process.exit(1);
}

export const env: EnvConfig = parsedEnv.data;
