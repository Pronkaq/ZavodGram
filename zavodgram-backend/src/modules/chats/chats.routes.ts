import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../core/database';
import { authMiddleware } from '../../middleware/auth';
import { ForbiddenError, NotFoundError, ValidationError } from '../../core/errors';
import { cacheInvalidate } from '../../core/redis';
import { rateLimiter } from '../../middleware/errorHandler';
import { ensureUuidArray, requireChatMembership, requireChatRole } from '../../core/security';

const router = Router();

const createChatSchema = z.object({
  type: z.enum(['PRIVATE', 'GROUP', 'CHANNEL', 'SECRET']),
  name: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
  memberIds: z.array(z.string().uuid()).max(100).optional(),
});

router.post('/', authMiddleware, rateLimiter(20, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createChatSchema.parse(req.body);
    const userId = req.user!.userId;

    const memberIds = ensureUuidArray(data.memberIds || [], 'memberIds').filter((id) => id !== userId);

    if (data.type === 'PRIVATE' || data.type === 'SECRET') {
      const otherUserId = memberIds[0];
      if (!otherUserId) throw new ValidationError('Укажите собеседника');

      const otherUser = await prisma.user.findUnique({ where: { id: otherUserId }, select: { id: true } });
      if (!otherUser) throw new ValidationError('Собеседник не существует');

      if (data.type === 'PRIVATE') {
        const existing = await prisma.chat.findFirst({
          where: {
            type: 'PRIVATE',
            AND: [
              { members: { some: { userId } } },
              { members: { some: { userId: otherUserId } } },
            ],
          },
          include: { members: { include: { user: { select: { id: true, name: true, tag: true, avatar: true } } } } },
        });
        if (existing) {
          res.json({ ok: true, data: existing });
          return;
        }
      }

      const chat = await prisma.chat.create({
        data: {
          type: data.type,
          createdBy: userId,
          members: {
            createMany: {
              data: [
                { userId, role: 'OWNER' },
                { userId: otherUserId, role: 'MEMBER' },
              ],
            },
          },
        },
        include: { members: { include: { user: { select: { id: true, name: true, tag: true, avatar: true } } } } },
      });

      res.status(201).json({ ok: true, data: chat });
      return;
    }

    if (!data.name) throw new ValidationError('Укажите название');

    if (memberIds.length > 0) {
      const existingUsers = await prisma.user.count({ where: { id: { in: memberIds } } });
      if (existingUsers !== memberIds.length) throw new ValidationError('Список участников содержит несуществующих пользователей');
    }

    const chat = await prisma.chat.create({
      data: {
        type: data.type,
        name: data.name,
        description: data.description,
        createdBy: userId,
        members: {
          createMany: {
            data: [
              { userId, role: 'OWNER' },
              ...memberIds.map((id) => ({ userId: id, role: 'MEMBER' as const })),
            ],
          },
        },
      },
      include: { members: { include: { user: { select: { id: true, name: true, tag: true, avatar: true } } } } },
    });

    res.status(201).json({ ok: true, data: chat });
  } catch (err) {
    if (err instanceof z.ZodError) next(new ValidationError(err.errors[0].message));
    else next(err);
  }
});

router.get('/', authMiddleware, rateLimiter(60, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;

    const chats = await prisma.chat.findMany({
      where: { members: { some: { userId } } },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, tag: true, avatar: true, lastSeen: true } } },
        },
        messages: {
          where: { deleted: false },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { from: { select: { id: true, name: true } } },
        },
        _count: { select: { members: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const chatsWithUnread = await Promise.all(
      chats.map(async (chat) => {
        const myMembership = chat.members.find((m) => m.userId === userId);
        const unreadCount = myMembership
          ? await prisma.message.count({
              where: {
                chatId: chat.id,
                createdAt: { gt: myMembership.lastRead },
                fromId: { not: userId },
                deleted: false,
              },
            })
          : 0;

        return {
          ...chat,
          unreadCount,
          muted: myMembership?.muted || false,
        };
      })
    );

    res.json({ ok: true, data: chatsWithUnread });
  } catch (err) { next(err); }
});

router.get('/:id', authMiddleware, rateLimiter(120, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const chat = await prisma.chat.findUnique({
      where: { id: req.params.id },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, tag: true, avatar: true, bio: true, lastSeen: true } } },
        },
        _count: { select: { members: true, messages: true } },
      },
    });
    if (!chat) throw new NotFoundError('Чат');

    const isMember = chat.members.some((m) => m.userId === req.user!.userId);
    if (!isMember && chat.type !== 'CHANNEL') throw new ForbiddenError();

    res.json({ ok: true, data: chat });
  } catch (err) { next(err); }
});

router.post('/:id/members', authMiddleware, rateLimiter(30, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = z.object({ userId: z.string().uuid() }).parse(req.body);
    const chatId = req.params.id;

    const chat = await prisma.chat.findUnique({ where: { id: chatId }, select: { id: true, type: true } });
    if (!chat) throw new NotFoundError('Чат');

    if (chat.type === 'PRIVATE' || chat.type === 'SECRET') {
      throw new ForbiddenError('Нельзя добавлять участников в личные чаты');
    }

    await requireChatRole(prisma, chatId, req.user!.userId, ['OWNER', 'ADMIN']);

    const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { id: true } });
    if (!user) throw new ValidationError('Пользователь не найден');

    const member = await prisma.chatMember.upsert({
      where: { chatId_userId: { chatId, userId: payload.userId } },
      create: { chatId, userId: payload.userId, role: 'MEMBER' },
      update: {},
      include: { user: { select: { id: true, name: true, tag: true, avatar: true } } },
    });

    await cacheInvalidate(`chat:${chatId}`);
    res.status(201).json({ ok: true, data: member });
  } catch (err) { next(err); }
});

router.delete('/:id/members/:userId', authMiddleware, rateLimiter(30, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: chatId, userId: targetId } = req.params;

    const myMembership = await requireChatMembership(prisma, chatId, req.user!.userId);
    const isLeavingSelf = targetId === req.user!.userId;

    if (!isLeavingSelf && !['OWNER', 'ADMIN'].includes(myMembership.role)) {
      throw new ForbiddenError();
    }

    await prisma.chatMember.deleteMany({ where: { chatId, userId: targetId } });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.patch('/:id/mute', authMiddleware, rateLimiter(60, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { muted } = z.object({ muted: z.boolean() }).parse(req.body);
    await requireChatMembership(prisma, req.params.id, req.user!.userId);

    await prisma.chatMember.update({
      where: { chatId_userId: { chatId: req.params.id, userId: req.user!.userId } },
      data: { muted },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
