import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
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

const loginSchema = z.object({
  phone: z.string(),
  password: z.string(),
});

const refreshSchema = z.object({ refreshToken: z.string().min(20) });
const logoutSchema = z.object({ refreshToken: z.string().min(20).optional() });

// ── Helpers ──
function generateTokens(payload: AuthPayload) {
  const accessToken = (jwt.sign as any)(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
  const refreshToken = (jwt.sign as any)({ ...payload, jti: uuid() }, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpiresIn });
  return { accessToken, refreshToken };
}

// ── POST /auth/register ──
router.post('/register', rateLimiter(5, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = registerSchema.parse(req.body);

    // Проверяем уникальность телефона
    const existingPhone = await prisma.user.findUnique({ where: { phone: data.phone } });
    if (existingPhone) throw new ConflictError('Этот номер уже зарегистрирован');

    // Проверяем бронирование тега
    const existingTag = await prisma.user.findUnique({ where: { tag: data.tag } });
    if (existingTag) throw new ConflictError('Этот тег уже занят');

    const tagReserved = await prisma.tagHistory.findUnique({ where: { tag: data.tag } });
    if (tagReserved) throw new ConflictError('Этот тег забронирован другим пользователем');

    // Создаём пользователя
    const hashedPassword = await bcrypt.hash(data.password, 12);
    const user = await prisma.user.create({
      data: {
        phone: data.phone,
        tag: data.tag,
        name: data.name,
        bio: data.bio || '',
        password: hashedPassword,
      },
    });

    // Бронируем тег навсегда
    await prisma.tagHistory.create({
      data: { tag: data.tag, userId: user.id },
    });

    // Генерируем токены
    const tokens = generateTokens({ userId: user.id, tag: user.tag });

    // Сохраняем сессию
    await prisma.session.create({
      data: {
        userId: user.id,
        refreshToken: tokens.refreshToken,
        deviceInfo: req.headers['user-agent'] || null,
        ipAddress: req.ip || null,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    });

    res.status(201).json({
      ok: true,
      data: {
        user: { id: user.id, tag: user.tag, name: user.name, phone: user.phone, bio: user.bio },
        ...tokens,
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
