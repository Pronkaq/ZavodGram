import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../core/database';
import { authMiddleware } from '../../middleware/auth';
import { ForbiddenError, NotFoundError, ValidationError } from '../../core/errors';
import { cacheInvalidate } from '../../core/redis';

const router = Router();

// ── POST /chats — Создать чат ──
const createChatSchema = z.object({
  type: z.enum(['PRIVATE', 'GROUP', 'CHANNEL', 'SECRET']),
  name: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
  memberIds: z.array(z.string()).optional(), // ID пользователей для добавления
});

router.post('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createChatSchema.parse(req.body);
    const userId = req.user!.userId;

    // Для приватного чата — ищем существующий или создаём
    if (data.type === 'PRIVATE' || data.type === 'SECRET') {
      const otherUserId = data.memberIds?.[0];
      if (!otherUserId) throw new ValidationError('Укажите собеседника');

      // Проверяем, нет ли уже такого чата
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

    // Группа или канал
    if (!data.name) throw new ValidationError('Укажите название');

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
              ...(data.memberIds || []).map((id) => ({ userId: id, role: 'MEMBER' as const })),
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

// ── GET /chats — Список моих чатов ──
router.get('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;

    const chats = await prisma.chat.findMany({
      where: { members: { some: { userId } } },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, tag: true, avatar: true, lastSeen: true } } },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { from: { select: { id: true, name: true } } },
        },
        _count: { select: { members: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Подсчёт непрочитанных для каждого чата
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

// ── GET /chats/:id ──
router.get('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
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

// ── POST /chats/:id/members — Добавить участника ──
router.post('/:id/members', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId: newUserId } = req.body;
    const chatId = req.params.id;

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: { members: true },
    });
    if (!chat) throw new NotFoundError('Чат');

    const myMembership = chat.members.find((m) => m.userId === req.user!.userId);
    if (!myMembership || (myMembership.role === 'MEMBER' && chat.type === 'CHANNEL')) {
      throw new ForbiddenError('Нет прав для добавления участников');
    }

    const member = await prisma.chatMember.create({
      data: { chatId, userId: newUserId, role: 'MEMBER' },
      include: { user: { select: { id: true, name: true, tag: true, avatar: true } } },
    });

    res.status(201).json({ ok: true, data: member });
  } catch (err) { next(err); }
});

// ── DELETE /chats/:id/members/:userId — Удалить участника ──
router.delete('/:id/members/:userId', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: chatId, userId: targetId } = req.params;

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: { members: true },
    });
    if (!chat) throw new NotFoundError('Чат');

    const myMembership = chat.members.find((m) => m.userId === req.user!.userId);
    const isLeavingSelf = targetId === req.user!.userId;

    if (!isLeavingSelf && (!myMembership || myMembership.role === 'MEMBER')) {
      throw new ForbiddenError();
    }

    await prisma.chatMember.deleteMany({ where: { chatId, userId: targetId } });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── PATCH /chats/:id/mute — Замьютить/размьютить чат ──
router.patch('/:id/mute', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { muted } = req.body;
    await prisma.chatMember.updateMany({
      where: { chatId: req.params.id, userId: req.user!.userId },
      data: { muted: Boolean(muted) },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
