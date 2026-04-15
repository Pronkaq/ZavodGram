import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { createHmac, createHash, randomBytes } from 'crypto';
import type { StringValue } from 'ms';
import { prisma } from '../../core/database';
import { config } from '../../config';
import { AuthError, ConflictError, ValidationError } from '../../core/errors';
import { logger } from '../../core/logger';
import { authMiddleware, AuthPayload } from '../../middleware/auth';
import { rateLimiter } from '../../middleware/errorHandler';
import { redis } from '../../core/redis';

const router = Router();

const registerSchema = z.object({
  nickname: z.string().regex(/^[a-zA-Z0-9_]{3,30}$/, 'Ник: от 3 до 30 символов, латиница/цифры/_'),
  name: z.string().min(1).max(100),
  password: z.string().min(8, 'Минимум 8 символов'),
  captchaId: z.string().min(10),
  captchaAnswer: z.string().min(1),
});

const loginSchema = z.object({
  nickname: z.string().regex(/^[a-zA-Z0-9_]{3,30}$/),
  password: z.string().min(1),
  captchaId: z.string().min(10),
  captchaAnswer: z.string().min(1),
});

const refreshSchema = z.object({ refreshToken: z.string().min(20) });
const logoutSchema = z.object({ refreshToken: z.string().min(20).optional() });

const recoveryResetSchema = z.object({
  nickname: z.string().regex(/^[a-zA-Z0-9_]{3,30}$/),
  recoveryCode: z.string().min(8),
  newPassword: z.string().min(8, 'Минимум 8 символов'),
  captchaId: z.string().min(10),
  captchaAnswer: z.string().min(1),
});

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

function hashValue(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function hashRefreshToken(refreshToken: string) {
  return createHmac('sha256', config.jwt.refreshSecret).update(refreshToken).digest('hex');
}

function normalizeNickname(nickname: string) {
  return nickname.trim().toLowerCase();
}

function toTag(nickname: string) {
  return `@${nickname}`;
}

async function assertNicknameAvailability(nickname: string) {
  const tag = toTag(nickname);
  const existingTag = await prisma.user.findUnique({ where: { tag } });
  if (existingTag) throw new ConflictError('Этот ник уже занят');

  const tagReserved = await prisma.tagHistory.findUnique({ where: { tag } });
  if (tagReserved) throw new ConflictError('Этот ник зарезервирован другим пользователем');
}

async function generateAnonymousPhone(): Promise<string> {
  for (let i = 0; i < 5; i += 1) {
    const suffix = randomBytes(5).toString('hex').slice(0, 10).replace(/[a-f]/g, (c) => (c.charCodeAt(0) - 87).toString());
    const candidate = `+79${suffix.slice(0, 9)}`;
    const existing = await prisma.user.findUnique({ where: { phone: candidate }, select: { id: true } });
    if (!existing) return candidate;
  }
  throw new ValidationError('Не удалось создать анонимный идентификатор, попробуйте еще раз');
}

function generateRecoveryCode() {
  const raw = randomBytes(10).toString('base64url').replace(/[-_]/g, '').toUpperCase();
  return raw.slice(0, 16);
}

const CAPTCHA_TTL_SEC = 300;
const LOCAL_CAPTCHA_MAX_ENTRIES = 5_000;

type CaptchaRecord = {
  hash: string;
  expiresAt: number;
};

const localCaptchaStore = new Map<string, CaptchaRecord>();
const usedCaptchaStore = new Map<string, number>();

function pruneExpiredLocalCaptchas(now = Date.now()) {
  for (const [key, record] of localCaptchaStore.entries()) {
    if (record.expiresAt <= now) localCaptchaStore.delete(key);
  }
}

function trimLocalCaptchaStore() {
  if (localCaptchaStore.size < LOCAL_CAPTCHA_MAX_ENTRIES) return;

  let oldestKey: string | null = null;
  let oldestExpiresAt = Number.POSITIVE_INFINITY;

  for (const [key, record] of localCaptchaStore.entries()) {
    if (record.expiresAt < oldestExpiresAt) {
      oldestExpiresAt = record.expiresAt;
      oldestKey = key;
    }
  }

  if (oldestKey) {
    localCaptchaStore.delete(oldestKey);
    logger.warn('Local captcha fallback store reached capacity, evicting oldest entry');
  }
}

function pruneUsedCaptchaMarks(now = Date.now()) {
  for (const [key, expiresAt] of usedCaptchaStore.entries()) {
    if (expiresAt <= now) usedCaptchaStore.delete(key);
  }
}

function trimUsedCaptchaStore() {
  if (usedCaptchaStore.size < LOCAL_CAPTCHA_MAX_ENTRIES) return;

  let oldestKey: string | null = null;
  let oldestExpiresAt = Number.POSITIVE_INFINITY;

  for (const [key, expiresAt] of usedCaptchaStore.entries()) {
    if (expiresAt < oldestExpiresAt) {
      oldestExpiresAt = expiresAt;
      oldestKey = key;
    }
  }

  if (oldestKey) {
    usedCaptchaStore.delete(oldestKey);
  }
}

function markCaptchaAsUsed(captchaId: string, ttlSec: number) {
  pruneUsedCaptchaMarks();
  trimUsedCaptchaStore();
  usedCaptchaStore.set(captchaId, Date.now() + ttlSec * 1000);
}

function isCaptchaMarkedAsUsed(captchaId: string) {
  pruneUsedCaptchaMarks();
  return usedCaptchaStore.has(captchaId);
}

function pruneExpiredLocalCaptchas(now = Date.now()) {
  for (const [key, record] of localCaptchaStore.entries()) {
    if (record.expiresAt <= now) localCaptchaStore.delete(key);
  }
}

function trimLocalCaptchaStore() {
  if (localCaptchaStore.size < LOCAL_CAPTCHA_MAX_ENTRIES) return;

  let oldestKey: string | null = null;
  let oldestExpiresAt = Number.POSITIVE_INFINITY;

  for (const [key, record] of localCaptchaStore.entries()) {
    if (record.expiresAt < oldestExpiresAt) {
      oldestExpiresAt = record.expiresAt;
      oldestKey = key;
    }
  }

  if (oldestKey) {
    localCaptchaStore.delete(oldestKey);
    logger.warn('Local captcha fallback store reached capacity, evicting oldest entry');
  }
}

function setLocalCaptcha(captchaId: string, answerHash: string, ttlSec: number) {
  pruneExpiredLocalCaptchas();
  trimLocalCaptchaStore();

  localCaptchaStore.set(captchaId, {
    hash: answerHash,
    expiresAt: Date.now() + ttlSec * 1000,
  });
}

function getLocalCaptchaHash(captchaId: string): string | null {
  pruneExpiredLocalCaptchas();

  const record = localCaptchaStore.get(captchaId);
  if (!record) return null;
  if (record.expiresAt <= Date.now()) {
    localCaptchaStore.delete(captchaId);
    return null;
  }
  return record.hash;
}

function deleteLocalCaptcha(captchaId: string) {
  localCaptchaStore.delete(captchaId);
}

async function getCaptchaHash(captchaId: string): Promise<string | null> {
  const key = `captcha:${captchaId}`;
  try {
    const value = await redis.get(key);
    if (value) return value;
  } catch (err) {
    logger.error('Failed to read captcha from Redis, trying local fallback', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return getLocalCaptchaHash(captchaId);
}

async function saveCaptchaHash(captchaId: string, answerHash: string, ttlSec: number): Promise<void> {
  const key = `captcha:${captchaId}`;
  try {
    await redis.set(key, answerHash, 'EX', ttlSec);
  } catch (err) {
    logger.error('Failed to save captcha to Redis, using local fallback', {
      error: err instanceof Error ? err.message : String(err),
    });
    setLocalCaptcha(captchaId, answerHash, ttlSec);
  }
}

async function deleteCaptcha(captchaId: string): Promise<void> {
  const key = `captcha:${captchaId}`;
  let redisDeleteFailed = false;

  try {
    await redis.del(key);
  } catch (err) {
    redisDeleteFailed = true;
    logger.error('Failed to delete captcha from Redis', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  deleteLocalCaptcha(captchaId);

  if (redisDeleteFailed) {
    throw new Error('Failed to invalidate captcha in Redis');
  }
}

async function verifyCaptcha(captchaId: string, captchaAnswer: string) {
  if (isCaptchaMarkedAsUsed(captchaId)) {
    throw new ValidationError('Капча устарела, обновите и попробуйте снова');
  }

  const expectedHash = await getCaptchaHash(captchaId);
  if (!expectedHash) throw new ValidationError('Капча устарела, обновите и попробуйте снова');

  const normalizedAnswer = captchaAnswer.trim();
  if (hashValue(normalizedAnswer) !== expectedHash) {
    throw new ValidationError('Неверный ответ капчи');
  }

  markCaptchaAsUsed(captchaId, CAPTCHA_TTL_SEC);
  await deleteCaptcha(captchaId);
}

async function assertRecoveryAllowed(nickname: string) {
  const normalizedNickname = normalizeNickname(nickname);
  const key = `recovery:attempts:${normalizedNickname}`;
  const attempts = await redis.incr(key);
  if (attempts === 1) await redis.expire(key, 15 * 60);
  if (attempts > 10) throw new AuthError('Не удалось сбросить пароль');
}

type CaptchaChallenge = {
  question: string;
  answer: string;
};

function getRandomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickCaptchaChallenge(): CaptchaChallenge {
  const challenges: CaptchaChallenge[] = [
    (() => {
      const a = getRandomInt(2, 9);
      const b = getRandomInt(2, 9);
      const c = getRandomInt(1, 9);
      return {
        question: `Посчитайте: (${a} × ${b}) - ${c} = ?`,
        answer: String(a * b - c),
      };
    })(),
    (() => {
      const a = getRandomInt(10, 99);
      const b = getRandomInt(10, 99);
      const sum = a + b;
      const reversed = String(sum).split('').reverse().join('');
      return {
        question: `Сложите ${a} и ${b}, затем введите сумму задом наперёд`,
        answer: reversed,
      };
    })(),
    (() => {
      const a = getRandomInt(11, 99);
      const b = getRandomInt(11, 99);
      const c = getRandomInt(11, 99);
      const max = Math.max(a, b, c);
      return {
        question: `Какое число больше: ${a}, ${b}, ${c}?`,
        answer: String(max),
      };
    })(),
    (() => {
      const a = getRandomInt(100, 999);
      const sum = String(a)
        .split('')
        .reduce((acc, digit) => acc + Number(digit), 0);
      return {
        question: `Введите сумму цифр числа ${a}`,
        answer: String(sum),
      };
    })(),
  ];

  return challenges[getRandomInt(0, challenges.length - 1)];
}

router.get('/captcha', rateLimiter(120, 60), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const challenge = pickCaptchaChallenge();
    const captchaId = randomBytes(18).toString('base64url');
    await saveCaptchaHash(captchaId, hashValue(challenge.answer), CAPTCHA_TTL_SEC);

    res.json({
      ok: true,
      data: {
        captchaId,
        question: challenge.question,
        expiresInSec: CAPTCHA_TTL_SEC,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/register', rateLimiter(5, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = registerSchema.parse(req.body);
    await verifyCaptcha(data.captchaId, data.captchaAnswer);
    await assertNicknameAvailability(data.nickname);

    const passwordHash = await bcrypt.hash(data.password, 12);
    const recoveryCode = generateRecoveryCode();
    const recoveryCodeHash = hashValue(recoveryCode);
    const anonPhone = await generateAnonymousPhone();
    const tag = toTag(data.nickname);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          phone: anonPhone,
          tag,
          name: data.name,
          bio: '',
          password: passwordHash,
        },
      });

      await tx.tagHistory.create({
        data: { tag: user.tag, userId: user.id },
      });

      await tx.userRecovery.upsert({
        where: { userId: user.id },
        update: { recoveryCodeHash },
        create: { userId: user.id, recoveryCodeHash },
      });

      const tokens = generateTokens({ userId: user.id, tag: user.tag });

      await tx.session.create({
        data: {
          userId: user.id,
          refreshToken: hashRefreshToken(tokens.refreshToken),
          deviceInfo: req.headers['user-agent'] || null,
          ipAddress: req.ip || null,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      return { user, tokens };
    });

    res.status(201).json({
      ok: true,
      data: {
        user: { id: result.user.id, tag: result.user.tag, name: result.user.name, bio: result.user.bio, avatar: result.user.avatar },
        ...result.tokens,
        recoveryCode,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) next(new ValidationError(err.errors[0].message));
    else next(err);
  }
});

router.post('/register/start', rateLimiter(5, 60), async (_req: Request, _res: Response, next: NextFunction) => {
  next(new ValidationError('Используйте /auth/register'));
});

router.post('/register/status', rateLimiter(30, 60), async (_req: Request, _res: Response, next: NextFunction) => {
  next(new ValidationError('Telegram-регистрация отключена'));
});

router.post('/register/complete', rateLimiter(10, 60), async (_req: Request, _res: Response, next: NextFunction) => {
  next(new ValidationError('Telegram-регистрация отключена'));
});

router.post('/internal/telegram/confirm', rateLimiter(60, 60), async (_req: Request, _res: Response, next: NextFunction) => {
  next(new ValidationError('Telegram-регистрация отключена'));
});

router.post('/login', rateLimiter(10, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = loginSchema.parse(req.body);
    await verifyCaptcha(data.captchaId, data.captchaAnswer);

    const user = await prisma.user.findUnique({ where: { tag: toTag(data.nickname) } });
    if (!user) throw new AuthError('Неверный ник или пароль');

    const valid = await bcrypt.compare(data.password, user.password);
    if (!valid) throw new AuthError('Неверный ник или пароль');

    const tokens = generateTokens({ userId: user.id, tag: user.tag });

    await prisma.session.create({
      data: {
        userId: user.id,
        refreshToken: hashRefreshToken(tokens.refreshToken),
        deviceInfo: req.headers['user-agent'] || null,
        ipAddress: req.ip || null,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

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

router.post('/recovery/reset-password', rateLimiter(5, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = recoveryResetSchema.parse(req.body);
    await verifyCaptcha(data.captchaId, data.captchaAnswer);
    await assertRecoveryAllowed(data.nickname);

    const user = await prisma.user.findUnique({ where: { tag: toTag(data.nickname) }, select: { id: true } });
    if (!user) throw new AuthError('Не удалось сбросить пароль');

    const recovery = await prisma.userRecovery.findUnique({ where: { userId: user.id } });
    if (!recovery || recovery.recoveryCodeHash !== hashValue(data.recoveryCode.trim().toUpperCase())) {
      throw new AuthError('Не удалось сбросить пароль');
    }

    const passwordHash = await bcrypt.hash(data.newPassword, 12);
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { password: passwordHash } }),
      prisma.session.deleteMany({ where: { userId: user.id } }),
      prisma.userRecovery.deleteMany({ where: { userId: user.id } }),
    ]);
    await redis.del(`recovery:attempts:${normalizeNickname(data.nickname)}`);

    res.json({ ok: true, data: { reset: true } });
  } catch (err) {
    if (err instanceof z.ZodError) next(new ValidationError(err.errors[0].message));
    else next(err);
  }
});

router.post('/refresh', rateLimiter(30, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    if (!refreshToken) throw new AuthError('Refresh token не предоставлен');
    const refreshTokenHash = hashRefreshToken(refreshToken);

    const payload = jwt.verify(refreshToken, config.jwt.refreshSecret) as AuthPayload & { jti: string };

    const session = await prisma.session.findUnique({ where: { refreshToken: refreshTokenHash } });
    if (!session || session.expiresAt < new Date()) {
      if (session) await prisma.session.delete({ where: { id: session.id } });
      throw new AuthError('Сессия истекла');
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { id: true, tag: true } });
    if (!user) throw new AuthError('Сессия недействительна');

    const tokens = generateTokens({ userId: user.id, tag: user.tag });

    await prisma.session.update({
      where: { id: session.id },
      data: { refreshToken: hashRefreshToken(tokens.refreshToken), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    });

    res.json({ ok: true, data: tokens });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', authMiddleware, rateLimiter(30, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = logoutSchema.parse(req.body);
    if (refreshToken) {
      await prisma.session.deleteMany({ where: { refreshToken: hashRefreshToken(refreshToken), userId: req.user!.userId } });
    }

    await prisma.user.update({ where: { id: req.user!.userId }, data: { online: false, lastSeen: new Date() } });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
