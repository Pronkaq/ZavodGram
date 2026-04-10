import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../core/database';
import { authMiddleware } from '../../middleware/auth';
import { ForbiddenError, ValidationError } from '../../core/errors';
import { config } from '../../config';
import { getBlockedUsers, setUserBlocked } from '../../core/redis';

const router = Router();

function ensureAdmin(req: Request) {
  const tag = req.user?.tag?.toLowerCase();
  if (!tag || !config.adminTags.includes(tag)) {
    throw new ForbiddenError('Админка доступна только администраторам');
  }
}

router.get('/stats', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureAdmin(req);

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [usersTotal, chatsTotal, messagesTotal, mediaTotal, usersToday, messagesToday] = await Promise.all([
      prisma.user.count(),
      prisma.chat.count(),
      prisma.message.count(),
      prisma.mediaFile.count(),
      prisma.user.count({ where: { createdAt: { gte: since } } }),
      prisma.message.count({ where: { createdAt: { gte: since } } }),
    ]);

    res.json({
      ok: true,
      data: {
        totals: {
          users: usersTotal,
          chats: chatsTotal,
          messages: messagesTotal,
          media: mediaTotal,
        },
        last24h: {
          users: usersToday,
          messages: messagesToday,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

const querySchema = z.object({
  q: z.string().trim().default(''),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

router.get('/users', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureAdmin(req);
    const { q, limit } = querySchema.parse(req.query);

    const users = await prisma.user.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { tag: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q, mode: 'insensitive' } },
            ],
          }
        : undefined,
      select: {
        id: true,
        name: true,
        tag: true,
        phone: true,
        createdAt: true,
        lastSeen: true,
        _count: {
          select: {
            messages: true,
            chatMembers: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const blockedSet = await getBlockedUsers(users.map((u) => u.id));
    res.json({ ok: true, data: users.map((u) => ({ ...u, blocked: blockedSet.has(u.id) })) });
  } catch (err) {
    if (err instanceof z.ZodError) next(new ValidationError(err.errors[0].message));
    else next(err);
  }
});

const blockSchema = z.object({
  blocked: z.boolean(),
  reason: z.string().max(300).optional(),
});

router.patch('/users/:id/block', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureAdmin(req);
    const { blocked, reason } = blockSchema.parse(req.body);
    const targetUserId = req.params.id;
    if (targetUserId === req.user!.userId) throw new ForbiddenError('Нельзя заблокировать самого себя');

    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
    if (!targetUser) throw new ValidationError('Пользователь не найден');

    await setUserBlocked(targetUserId, blocked, reason);
    if (blocked) {
      await prisma.session.deleteMany({ where: { userId: targetUserId } });
    }

    res.json({ ok: true, data: { userId: targetUserId, blocked } });
  } catch (err) {
    if (err instanceof z.ZodError) next(new ValidationError(err.errors[0].message));
    else next(err);
  }
});

router.delete('/users/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureAdmin(req);
    const targetUserId = req.params.id;
    if (targetUserId === req.user!.userId) throw new ForbiddenError('Нельзя удалить самого себя');

    await prisma.user.delete({ where: { id: targetUserId } });
    await setUserBlocked(targetUserId, false);

    res.json({ ok: true, data: { deleted: true, userId: targetUserId } });
  } catch (err) {
    next(err);
  }
});


const mirrorSlugSchema = z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9_]+$/, 'sourceSlug: только буквы, цифры и _');

router.get('/channels', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureAdmin(req);
    const channels = await prisma.chat.findMany({
      where: { type: 'CHANNEL' },
      select: { id: true, name: true, channelSlug: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json({ ok: true, data: channels });
  } catch (err) {
    next(err);
  }
});

router.get('/telegram-mirrors', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureAdmin(req);
    const mirrors = await prisma.telegramChannelMirrorState.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const targetIds = mirrors.map((m) => m.targetChatId);
    const chats = targetIds.length > 0
      ? await prisma.chat.findMany({ where: { id: { in: targetIds } }, select: { id: true, name: true, channelSlug: true } })
      : [];
    const chatMap = new Map(chats.map((c) => [c.id, c]));

    res.json({ ok: true, data: mirrors.map((m) => ({ ...m, targetChat: chatMap.get(m.targetChatId) || null })) });
  } catch (err) {
    next(err);
  }
});

const mirrorCreateSchema = z.object({
  sourceSlug: mirrorSlugSchema,
  targetChatId: z.string().uuid(),
  enabled: z.boolean().optional(),
});

router.post('/telegram-mirrors', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureAdmin(req);
    const payload = mirrorCreateSchema.parse(req.body);

    const target = await prisma.chat.findFirst({ where: { id: payload.targetChatId, type: 'CHANNEL' }, select: { id: true } });
    if (!target) throw new ValidationError('Целевой канал не найден');

    const created = await prisma.telegramChannelMirrorState.upsert({
      where: { sourceSlug_targetChatId: { sourceSlug: payload.sourceSlug, targetChatId: payload.targetChatId } },
      create: { sourceSlug: payload.sourceSlug, targetChatId: payload.targetChatId, enabled: payload.enabled ?? true },
      update: { enabled: payload.enabled ?? true },
    });

    res.status(201).json({ ok: true, data: created });
  } catch (err) {
    if (err instanceof z.ZodError) next(new ValidationError(err.errors[0].message));
    else next(err);
  }
});

const mirrorUpdateSchema = z.object({
  sourceSlug: mirrorSlugSchema.optional(),
  targetChatId: z.string().uuid().optional(),
  enabled: z.boolean().optional(),
});

router.patch('/telegram-mirrors/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureAdmin(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const payload = mirrorUpdateSchema.parse(req.body);

    const existing = await prisma.telegramChannelMirrorState.findUnique({ where: { id } });
    if (!existing) throw new ValidationError('Правило зеркалирования не найдено');

    const targetChatId = payload.targetChatId || existing.targetChatId;
    if (payload.targetChatId) {
      const target = await prisma.chat.findFirst({ where: { id: targetChatId, type: 'CHANNEL' }, select: { id: true } });
      if (!target) throw new ValidationError('Целевой канал не найден');
    }

    const updated = await prisma.telegramChannelMirrorState.update({
      where: { id },
      data: {
        ...(payload.sourceSlug !== undefined ? { sourceSlug: payload.sourceSlug } : {}),
        ...(payload.targetChatId !== undefined ? { targetChatId } : {}),
        ...(payload.enabled !== undefined ? { enabled: payload.enabled } : {}),
      },
    });

    res.json({ ok: true, data: updated });
  } catch (err) {
    if (err instanceof z.ZodError) next(new ValidationError(err.errors[0].message));
    else next(err);
  }
});

router.delete('/telegram-mirrors/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureAdmin(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await prisma.telegramChannelMirrorState.delete({ where: { id } });
    res.json({ ok: true, data: { deleted: true, id } });
  } catch (err) {
    if (err instanceof z.ZodError) next(new ValidationError(err.errors[0].message));
    else next(err);
  }
});

export default router;
