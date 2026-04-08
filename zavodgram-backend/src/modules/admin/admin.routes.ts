import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../core/database';
import { authMiddleware } from '../../middleware/auth';
import { ForbiddenError, ValidationError } from '../../core/errors';
import { config } from '../../config';

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

    res.json({ ok: true, data: users });
  } catch (err) {
    if (err instanceof z.ZodError) next(new ValidationError(err.errors[0].message));
    else next(err);
  }
});

export default router;
