import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../core/database';
import { authMiddleware } from '../../middleware/auth';
import { rateLimiter } from '../../middleware/errorHandler';

const router = Router();

// ── GET /notifications ──
router.get('/', authMiddleware, rateLimiter(60, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 30, 100);

    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const unreadCount = await prisma.notification.count({
      where: { userId: req.user!.userId, read: false },
    });

    res.json({ ok: true, data: { notifications, unreadCount } });
  } catch (err) { next(err); }
});

// ── POST /notifications/read — Отметить прочитанными ──
router.post('/read', authMiddleware, rateLimiter(60, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids } = req.body; // массив ID или пусто для "все"

    if (ids && Array.isArray(ids)) {
      await prisma.notification.updateMany({
        where: { id: { in: ids }, userId: req.user!.userId },
        data: { read: true },
      });
    } else {
      await prisma.notification.updateMany({
        where: { userId: req.user!.userId, read: false },
        data: { read: true },
      });
    }

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── DELETE /notifications — Очистить все ──
router.delete('/', authMiddleware, rateLimiter(20, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.notification.deleteMany({ where: { userId: req.user!.userId } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;

// ── Хелпер для создания уведомлений (используется из WebSocket) ──
export async function createNotification(params: {
  userId: string;
  type: 'NEW_MESSAGE' | 'MENTION' | 'ADDED_TO_CHAT' | 'REMOVED_FROM_CHAT' | 'CHAT_UPDATED';
  title: string;
  body: string;
  data?: Record<string, unknown>;
}) {
  return prisma.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body,
      data: (params.data || {}) as any,
    },
  });
}
