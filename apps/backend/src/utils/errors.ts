import { Request, Response, NextFunction } from 'express';
import { logger } from './logger';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Global Express error handler middleware
export const errorHandler = (
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (err instanceof AppError) {
    logger.warn({
      message: err.message,
      statusCode: err.statusCode,
      stack: err.stack,
    }, 'Operasional AppError tertangkap');

    res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    });
    return;
  }

  // Unhandled / programmer errors
  logger.error({
    message: err.message,
    stack: err.stack,
  }, 'Unhandled Exception tertangkap di HTTP layer');

  res.status(500).json({
    status: 'error',
    message: 'Terjadi kesalahan internal pada server.',
  });
};

// Handler untuk uncaught exception dan unhandled rejection
export const setupProcessErrorHandlers = (): void => {
  process.on('uncaughtException', (error: Error) => {
    logger.fatal({ err: error, stack: error.stack }, 'FATAL: Uncaught Exception terjadi!');
    // Beri waktu logger flush sebelum exit
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });

  process.on('unhandledRejection', (reason: unknown) => {
    logger.error({ reason }, 'WARNING: Unhandled Promise Rejection terdeteksi');
  });
};
