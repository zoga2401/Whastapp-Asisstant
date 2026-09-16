import pino from 'pino';
import path from 'path';
import fs from 'fs';
import { env } from '../config/env';

// Pastikan direktori logs tersedia
const logDir = path.resolve(__dirname, '../../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const targets: pino.TransportTargetOptions[] = [
  // Output terminal: format rapi menggunakan pino-pretty
  {
    target: 'pino-pretty',
    level: env.LOG_LEVEL,
    options: {
      colorize: true,
      translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
      ignore: 'pid,hostname',
    },
  },
];

// Jika logging ke file aktif, tambahkan destination file
if (env.LOG_TO_FILE) {
  const resolvedLogFile = path.resolve(logDir, 'app.log');
  targets.push({
    target: 'pino/file',
    level: env.LOG_LEVEL,
    options: {
      destination: resolvedLogFile,
      mkdir: true,
    },
  });
}

export const logger = pino({
  level: env.LOG_LEVEL,
  base: {
    env: env.NODE_ENV,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
}, pino.transport({ targets }));
