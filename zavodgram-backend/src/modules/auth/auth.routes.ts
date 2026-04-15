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

async function verifyCaptcha(captchaId: string, captchaAnswer: string) {
  const key = `captcha:${captchaId}`;
  const expectedHash = await redis.get(key);
  if (!expectedHash) throw new ValidationError('Капча устарела, обновите и попробуйте снова');

  const normalizedAnswer = captchaAnswer.trim();
  if (hashValue(normalizedAnswer) !== expectedHash) {
    throw new ValidationError('Неверный ответ капчи');
  }

  await redis.del(key);
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

router.get('/captcha', rateLimiter(30, 60), async (_req: Request, res: Response) => {
  const challenge = pickCaptchaChallenge();
  const captchaId = randomBytes(18).toString('base64url');
  await redis.set(`captcha:${captchaId}`, hashValue(challenge.answer), 'EX', 300);

  res.json({
    ok: true,
    data: {
      captchaId,
      question: challenge.question,
      expiresInSec: 300,
    },
  });
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
          refreshToken: hashValue(tokens.refreshToken),
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
        refreshToken: hashValue(tokens.refreshToken),
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
    const refreshTokenHash = hashValue(refreshToken);

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
      data: { refreshToken: hashValue(tokens.refreshToken), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
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
      await prisma.session.deleteMany({ where: { refreshToken: hashValue(refreshToken), userId: req.user!.userId } });
    }

    await prisma.user.update({ where: { id: req.user!.userId }, data: { online: false, lastSeen: new Date() } });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
