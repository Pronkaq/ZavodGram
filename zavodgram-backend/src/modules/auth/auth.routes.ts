import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { createHash, randomBytes } from 'crypto';
import type { StringValue } from 'ms';
import { prisma } from '../../core/database';
import { config } from '../../config';
import { AuthError, ConflictError, ValidationError } from '../../core/errors';
import { authMiddleware, AuthPayload } from '../../middleware/auth';
import { rateLimiter } from '../../middleware/errorHandler';

const router = Router();

// ── Schemas ──
const registerSchema = z.object({
  phone: z.string().regex(/^\+7\d{10}$/, 'Формат: +7XXXXXXXXXX'),
  tag: z.string().regex(/^@[a-zA-Z0-9_]{3,30}$/, 'Тег: @abc_123, от 3 до 30 символов'),
  name: z.string().min(1).max(100),
  password: z.string().min(6, 'Минимум 6 символов'),
  bio: z.string().max(300).optional(),
});

const registerCompleteSchema = z.object({
  registrationId: z.string().uuid('Некорректный registrationId'),
});

const registerStatusSchema = z.object({
  registrationId: z.string().uuid('Некорректный registrationId'),
});

const telegramConfirmSchema = z.object({
  token: z.string().min(32, 'Некорректный токен подтверждения'),
  telegramUser: z.object({
    id: z.union([z.string(), z.number()]),
    username: z.string().optional(),
    firstName: z.string().optional(),
  }),
});

const loginSchema = z.object({
  phone: z.string(),
  password: z.string(),
});

const refreshSchema = z.object({ refreshToken: z.string().min(20) });
const logoutSchema = z.object({ refreshToken: z.string().min(20).optional() });

// ── Helpers ──
function getJwtExpiresIn(value: string | number): number | StringValue {
  if (typeof value === 'number') return value;
  return value as StringValue;
}

function generateTokens(payload: AuthPayload) {
  const accessToken = jwt.sign(payload, config.jwt.secret, {
    expiresIn: getJwtExpiresIn(config.jwt.expiresIn),
  });
  const refreshToken = jwt.sign({ ...payload, jti: uuid() }, config.jwt.refreshSecret, {
    expiresIn: getJwtExpiresIn(config.jwt.refreshExpiresIn),
  });
  return { accessToken, refreshToken };
}

function hashVerificationToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

async function assertRegistrationAvailability(phone: string, tag: string) {
  const existingPhone = await prisma.user.findUnique({ where: { phone } });
  if (existingPhone) throw new ConflictError('Этот номер уже зарегистрирован');

  const existingTag = await prisma.user.findUnique({ where: { tag } });
  if (existingTag) throw new ConflictError('Этот тег уже занят');

  const tagReserved = await prisma.tagHistory.findUnique({ where: { tag } });
  if (tagReserved) throw new ConflictError('Этот тег забронирован другим пользователем');
}

async function completeRegistration(
  registrationId: string,
  req: Request,
) {
  const attempt = await prisma.registrationAttempt.findUnique({ where: { id: registrationId } });
  if (!attempt) throw new AuthError('Заявка на регистрацию не найдена');

  if (attempt.status === 'COMPLETED') {
    throw new ConflictError('Регистрация уже завершена');
  }

  if (attempt.expiresAt < new Date()) {
    await prisma.registrationAttempt.update({
      where: { id: attempt.id },
      data: { status: 'EXPIRED' },
    });
    throw new AuthError('Время подтверждения истекло');
  }

  if (attempt.status !== 'CONFIRMED') {
    throw new AuthError('Подтвердите регистрацию в Telegram');
  }

  await assertRegistrationAvailability(attempt.phone, attempt.tag);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        phone: attempt.phone,
        tag: attempt.tag,
        name: attempt.name,
        bio: attempt.bio || '',
        password: attempt.passwordHash,
      },
    });

    await tx.tagHistory.create({
      data: { tag: user.tag, userId: user.id },
    });

    const tokens = generateTokens({ userId: user.id, tag: user.tag });

    await tx.session.create({
      data: {
        userId: user.id,
        refreshToken: tokens.refreshToken,
        deviceInfo: req.headers['user-agent'] || null,
        ipAddress: req.ip || null,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    await tx.registrationAttempt.update({
      where: { id: attempt.id },
      data: { status: 'COMPLETED' },
    });

    return { user, tokens };
  });

  return {
    user: {
      id: result.user.id,
      tag: result.user.tag,
      name: result.user.name,
      phone: result.user.phone,
      bio: result.user.bio,
    },
    ...result.tokens,
  };
}

// ── POST /auth/register ──
router.post('/register', rateLimiter(5, 60), async (_req: Request, _res: Response, next: NextFunction) => {
  next(new ValidationError('Используйте /auth/register/start и завершите подтверждение через Telegram'));
});

// ── POST /auth/register/start ──
router.post('/register/start', rateLimiter(5, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = registerSchema.parse(req.body);
    await assertRegistrationAvailability(data.phone, data.tag);

    const rawVerificationToken = randomBytes(32).toString('hex');
    const verificationTokenHash = hashVerificationToken(rawVerificationToken);
    const passwordHash = await bcrypt.hash(data.password, 12);
    const ttlMs = config.telegram.verificationTtlMinutes * 60 * 1000;
    const expiresAt = new Date(Date.now() + ttlMs);

    const attempt = await prisma.registrationAttempt.create({
      data: {
        phone: data.phone,
        tag: data.tag,
        name: data.name,
        bio: data.bio || '',
        passwordHash,
        verificationTokenHash,
        expiresAt,
      },
    });

    const botUsername = config.telegram.botUsername;
    const telegramDeepLink = botUsername
      ? `https://t.me/${botUsername}?start=verify_${rawVerificationToken}`
      : '';

    res.status(201).json({
      ok: true,
      data: {
        registrationId: attempt.id,
        expiresAt,
        telegramDeepLink,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      next(new ValidationError(err.errors[0].message));
    } else {
      next(err);
    }
  }
});

// ── POST /auth/register/status ──
router.post('/register/status', rateLimiter(30, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { registrationId } = registerStatusSchema.parse(req.body);
    const attempt = await prisma.registrationAttempt.findUnique({
      where: { id: registrationId },
      select: { status: true, expiresAt: true, confirmedAt: true },
    });

    if (!attempt) throw new AuthError('Заявка на регистрацию не найдена');

    res.json({ ok: true, data: attempt });
  } catch (err) {
    if (err instanceof z.ZodError) next(new ValidationError(err.errors[0].message));
    else next(err);
  }
});

// ── POST /auth/register/complete ──
router.post('/register/complete', rateLimiter(10, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { registrationId } = registerCompleteSchema.parse(req.body);
    const data = await completeRegistration(registrationId, req);
    res.status(201).json({ ok: true, data });
  } catch (err) {
    if (err instanceof z.ZodError) next(new ValidationError(err.errors[0].message));
    else next(err);
  }
});

// ── POST /auth/internal/telegram/confirm ──
router.post('/internal/telegram/confirm', rateLimiter(60, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!config.telegram.internalToken) {
      throw new AuthError('Telegram internal token не настроен');
    }

    const internalToken = req.header('x-telegram-internal-token');
    if (internalToken !== config.telegram.internalToken) {
      throw new AuthError('Недействительный токен бота');
    }

    const { token, telegramUser } = telegramConfirmSchema.parse(req.body);
    const tokenHash = hashVerificationToken(token);

    const attempt = await prisma.registrationAttempt.findUnique({ where: { verificationTokenHash: tokenHash } });
    if (!attempt) throw new AuthError('Токен подтверждения не найден');

    if (attempt.status === 'COMPLETED') {
      res.json({ ok: true, data: { status: attempt.status } });
      return;
    }

    if (attempt.status === 'CONFIRMED') {
      res.json({ ok: true, data: { status: attempt.status } });
      return;
    }

    if (attempt.expiresAt < new Date()) {
      await prisma.registrationAttempt.update({
        where: { id: attempt.id },
        data: { status: 'EXPIRED' },
      });
      throw new AuthError('Время подтверждения истекло');
    }

    await prisma.registrationAttempt.update({
      where: { id: attempt.id },
      data: {
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        telegramId: String(telegramUser.id),
        telegramUsername: telegramUser.username || null,
      },
    });

    res.json({ ok: true, data: { status: 'CONFIRMED' } });
  } catch (err) {
    if (err instanceof z.ZodError) next(new ValidationError(err.errors[0].message));
    else next(err);
  }
});

// ── POST /auth/login ──
router.post('/login', rateLimiter(10, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { phone: data.phone } });
    if (!user) throw new AuthError('Неверный номер или пароль');

    const valid = await bcrypt.compare(data.password, user.password);
    if (!valid) throw new AuthError('Неверный номер или пароль');

    const tokens = generateTokens({ userId: user.id, tag: user.tag });

    await prisma.session.create({
      data: {
        userId: user.id,
        refreshToken: tokens.refreshToken,
        deviceInfo: req.headers['user-agent'] || null,
        ipAddress: req.ip || null,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    // Обновляем онлайн-статус
    await prisma.user.update({ where: { id: user.id }, data: { online: true, lastSeen: new Date() } });

    res.json({
      ok: true,
      data: {
        user: { id: user.id, tag: user.tag, name: user.name, phone: user.phone, bio: user.bio, avatar: user.avatar },
        ...tokens,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) next(new ValidationError(err.errors[0].message));
    else next(err);
  }
});

// ── POST /auth/refresh ──
router.post('/refresh', rateLimiter(30, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    if (!refreshToken) throw new AuthError('Refresh token не предоставлен');

    const payload = jwt.verify(refreshToken, config.jwt.refreshSecret) as AuthPayload & { jti: string };

    const session = await prisma.session.findUnique({ where: { refreshToken } });
    if (!session || session.expiresAt < new Date()) {
      if (session) await prisma.session.delete({ where: { id: session.id } });
      throw new AuthError('Сессия истекла');
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { id: true, tag: true } });
    if (!user) throw new AuthError('Сессия недействительна');

    const tokens = generateTokens({ userId: user.id, tag: user.tag });

    // Ротация refresh token
    await prisma.session.update({
      where: { id: session.id },
      data: { refreshToken: tokens.refreshToken, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    });

    res.json({ ok: true, data: tokens });
  } catch (err) {
    next(err);
  }
});

// ── POST /auth/logout ──
router.post('/logout', authMiddleware, rateLimiter(30, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = logoutSchema.parse(req.body);
    if (refreshToken) {
      await prisma.session.deleteMany({ where: { refreshToken, userId: req.user!.userId } });
    }

    await prisma.user.update({ where: { id: req.user!.userId }, data: { online: false, lastSeen: new Date() } });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
