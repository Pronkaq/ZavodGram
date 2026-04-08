import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AuthError } from '../core/errors';
import { isUserBlocked, setUserOnline } from '../core/redis';

export interface AuthPayload {
  userId: string;
  tag: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export async function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new AuthError();

    const token = header.slice(7);
    const payload = jwt.verify(token, config.jwt.secret) as AuthPayload;
    const blocked = await isUserBlocked(payload.userId);
    if (blocked) throw new AuthError('Аккаунт заблокирован');

    req.user = payload;

    // Обновляем онлайн-статус при каждом API-запросе
    setUserOnline(payload.userId).catch(() => {});

    next();
  } catch {
    next(new AuthError());
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      const token = header.slice(7);
      req.user = jwt.verify(token, config.jwt.secret) as AuthPayload;
    }
  } catch {
    // Не критично — пользователь просто не авторизован
  }
  next();
}
