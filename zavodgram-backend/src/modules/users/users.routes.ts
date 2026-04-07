import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../core/database';
import { authMiddleware } from '../../middleware/auth';
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors';
import { isUserOnline, cacheGet, cacheSet, cacheInvalidate } from '../../core/redis';
import { rateLimiter } from '../../middleware/errorHandler';

const router = Router();

// ── GET /users/me ──
router.get('/me', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, name: true, tag: true, phone: true, bio: true, avatar: true, createdAt: true },
    });
    if (!user) throw new NotFoundError('Пользователь');

    res.json({ ok: true, data: { ...user, online: true } });
  } catch (err) { next(err); }
});

// ── PATCH /users/me ──
const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  bio: z.string().max(300).optional(),
});

router.patch('/me', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data,
      select: { id: true, name: true, tag: true, phone: true, bio: true, avatar: true },
    });
    await cacheInvalidate(`user:${user.id}`);
    res.json({ ok: true, data: user });
  } catch (err) {
    if (err instanceof z.ZodError) next(new ValidationError(err.errors[0].message));
    else next(err);
  }
});

// ── PUT /users/me/tag ── Смена тега (бронирование)
const tagSchema = z.object({
  tag: z.string().regex(/^@[a-zA-Z0-9_]{3,30}$/, 'Некорректный формат тега'),
});

router.put('/me/tag', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tag } = tagSchema.parse(req.body);

    // Проверяем — не занят ли тег другим пользователем
    const existing = await prisma.tagHistory.findUnique({ where: { tag } });
    if (existing && existing.userId !== req.user!.userId) {
      throw new ConflictError('Этот тег уже забронирован другим пользователем');
    }

    // Транзакция: обновляем тег + бронируем
    await prisma.$transaction([
      prisma.user.update({ where: { id: req.user!.userId }, data: { tag } }),
      prisma.tagHistory.upsert({
        where: { tag },
        create: { tag, userId: req.user!.userId },
        update: {},
      }),
    ]);

    await cacheInvalidate(`user:${req.user!.userId}`);

    res.json({ ok: true, data: { tag } });
  } catch (err) {
    if (err instanceof z.ZodError) next(new ValidationError(err.errors[0].message));
    else next(err);
  }
});

// ── GET /users/search?q=... ──
router.get('/search', authMiddleware, rateLimiter(30, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = (req.query.q as string || '').trim();
    if (q.length < 2) {
      res.json({ ok: true, data: [] });
      return;
    }

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { tag: { contains: q, mode: 'insensitive' } },
        ],
        id: { not: req.user!.userId },
      },
      select: { id: true, name: true, tag: true, avatar: true, bio: true, lastSeen: true },
      take: 20,
    });

    // Добавляем онлайн-статус
    const usersWithOnline = await Promise.all(
      users.map(async (u) => ({ ...u, online: await isUserOnline(u.id) }))
    );

    res.json({ ok: true, data: usersWithOnline });
  } catch (err) { next(err); }
});

// ── GET /users/tag/:tag ── Поиск по тегу
router.get('/tag/:tag', authMiddleware, rateLimiter(60, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tag = req.params.tag.startsWith('@') ? req.params.tag : `@${req.params.tag}`;
    const user = await prisma.user.findUnique({
      where: { tag },
      select: { id: true, name: true, tag: true, bio: true, avatar: true, lastSeen: true },
    });
    if (!user) throw new NotFoundError('Пользователь');

    const online = await isUserOnline(user.id);
    res.json({ ok: true, data: { ...user, online } });
  } catch (err) { next(err); }
});

// ── GET /users/:id ──
router.get('/:id', authMiddleware, rateLimiter(60, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cached = await cacheGet(`user:${req.params.id}`);
    if (cached) {
      const online = await isUserOnline(req.params.id);
      res.json({ ok: true, data: { ...(cached as object), online } });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, tag: true, bio: true, avatar: true, lastSeen: true, createdAt: true },
    });
    if (!user) throw new NotFoundError('Пользователь');

    await cacheSet(`user:${user.id}`, user, 600);
    const online = await isUserOnline(user.id);

    res.json({ ok: true, data: { ...user, online } });
  } catch (err) { next(err); }
});

export default router;
