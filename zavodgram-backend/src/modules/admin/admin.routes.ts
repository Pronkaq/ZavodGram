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

export default router;
