import { logger } from '../utils/logger';

export function failClosed(reason: string, error?: unknown): { sent: false; reason: string } {
  logger.warn({ reason, error: error instanceof Error ? error.message : undefined }, '[AUTO-REPLY] Fail closed');
  return { sent: false, reason };
}
