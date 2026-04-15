import { Request, Response, NextFunction } from 'express';
import { AppError } from '../core/errors';
import { rateLimit } from '../core/redis';
import { logger } from '../core/logger';

// ── Global error handler ──
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      ok: false,
      error: { code: err.code, message: err.message },
    });
    return;
  }

  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({
    ok: false,
    error: { code: 'INTERNAL', message: 'Внутренняя ошибка сервера' },
  });
}

// ── Rate limiter ──
export function rateLimiter(limit: number, windowSec: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const actor = req.user?.userId || (typeof req.body?.nickname === 'string' ? req.body.nickname.toLowerCase() : 'anon');
    const key = `${req.method}:${req.ip}:${req.path}:${actor}`;
    const allowed = await rateLimit(key, limit, windowSec);
    if (!allowed) {
      res.status(429).json({
        ok: false,
        error: { code: 'RATE_LIMIT', message: 'Слишком много запросов' },
      });
      return;
    }
    next();
  };
}
