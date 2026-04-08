import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../core/database';
import { authMiddleware } from '../../middleware/auth';
import { ForbiddenError, NotFoundError, ValidationError } from '../../core/errors';
import { cacheInvalidate } from '../../core/redis';
import { rateLimiter } from '../../middleware/errorHandler';
import { ensureUuidArray, requireChatMembership, requireChatRole } from '../../core/security';
import { redisPub } from '../../core/redis';

const router = Router();
const channelSlugSchema = z.string().regex(/^[a-z0-9._-]{3,64}$/i, 'Некорректная ссылка канала');

// ── POST /chats — Create chat ──
const createChatSchema = z.object({
  type: z.enum(['PRIVATE', 'GROUP', 'CHANNEL', 'SECRET']),
  name: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
  channelSlug: z.string().regex(/^[a-z0-9._-]{3,64}$/i, 'Ссылка канала: 3-64 символа (буквы, цифры, ., _, -)').optional(),
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
          where: { type: 'PRIVATE', AND: [{ members: { some: { userId } } }, { members: { some: { userId: otherUserId } } }] },
          include: { members: { include: { user: { select: { id: true, name: true, tag: true, avatar: true } } } } },
        });
        if (existing) { res.json({ ok: true, data: existing }); return; }
      }

      const chat = await prisma.chat.create({
        data: { type: data.type, createdBy: userId, members: { createMany: { data: [{ userId, role: 'OWNER' }, { userId: otherUserId, role: 'MEMBER' }] } } },
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

    if (data.type === 'CHANNEL' && data.channelSlug) {
      const existingSlug = await prisma.chat.findUnique({ where: { channelSlug: data.channelSlug } });
      if (existingSlug) throw new ValidationError('Эта ссылка канала уже занята');
    }

    const chat = await prisma.chat.create({
      data: {
        type: data.type, name: data.name, description: data.description, channelSlug: data.type === 'CHANNEL' ? (data.channelSlug || null) : null, createdBy: userId,
        members: { createMany: { data: [{ userId, role: 'OWNER' }, ...memberIds.map((id) => ({ userId: id, role: 'MEMBER' as const }))] } },
      },
      include: { members: { include: { user: { select: { id: true, name: true, tag: true, avatar: true } } } } },
    });
    res.status(201).json({ ok: true, data: chat });
  } catch (err) {
    if (err instanceof z.ZodError) next(new ValidationError(err.errors[0].message));
    else next(err);
  }
});

// ── GET /chats — List my chats ──
router.get('/', authMiddleware, rateLimiter(60, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const chats = await prisma.chat.findMany({
      where: { members: { some: { userId } } },
      include: {
        members: { include: { user: { select: { id: true, name: true, tag: true, avatar: true, lastSeen: true } } } },
        messages: { where: { deleted: false }, orderBy: { createdAt: 'desc' }, take: 1, include: { from: { select: { id: true, name: true } } } },
        _count: { select: { members: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const chatsWithUnread = await Promise.all(
      chats.map(async (chat) => {
        const myMembership = chat.members.find((m) => m.userId === userId);
        const unreadCount = myMembership
          ? await prisma.message.count({ where: { chatId: chat.id, createdAt: { gt: myMembership.lastRead }, fromId: { not: userId }, deleted: false } })
          : 0;
        return { ...chat, unreadCount, muted: myMembership?.muted || false, myRole: myMembership?.role || 'MEMBER' };
      })
    );
    res.json({ ok: true, data: chatsWithUnread });
  } catch (err) { next(err); }
});

// ── GET /chats/public/:slug — Public channel by slug ──
router.get('/public/:slug', rateLimiter(120, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slug = channelSlugSchema.parse(req.params.slug);
    const channel = await prisma.chat.findFirst({
      where: { type: 'CHANNEL', channelSlug: slug },
      include: {
        _count: { select: { members: true, messages: true } },
      },
    });
    if (!channel) throw new NotFoundError('Канал');
    res.json({ ok: true, data: channel });
  } catch (err) {
    if (err instanceof z.ZodError) next(new ValidationError(err.errors[0].message));
    else next(err);
  }
});

// ── GET /chats/:id ──
router.get('/:id', authMiddleware, rateLimiter(120, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const chat = await prisma.chat.findUnique({
      where: { id: req.params.id },
      include: {
        members: { include: { user: { select: { id: true, name: true, tag: true, avatar: true, bio: true, lastSeen: true } } } },
        _count: { select: { members: true, messages: true } },
      },
    });
    if (!chat) throw new NotFoundError('Чат');
    const isMember = chat.members.some((m) => m.userId === req.user!.userId);
    if (!isMember && chat.type !== 'CHANNEL') throw new ForbiddenError();

    const myMembership = chat.members.find((m) => m.userId === req.user!.userId);
    res.json({ ok: true, data: { ...chat, myRole: myMembership?.role || 'MEMBER' } });
  } catch (err) { next(err); }
});

// ── POST /chats/public/:slug/join — Join channel by slug ──
router.post('/public/:slug/join', authMiddleware, rateLimiter(20, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slug = channelSlugSchema.parse(req.params.slug);
    const channel = await prisma.chat.findFirst({
      where: { type: 'CHANNEL', channelSlug: slug },
      select: { id: true },
    });
    if (!channel) throw new NotFoundError('Канал');

    await prisma.chatMember.upsert({
      where: { chatId_userId: { chatId: channel.id, userId: req.user!.userId } },
      create: { chatId: channel.id, userId: req.user!.userId, role: 'MEMBER' },
      update: {},
    });

    const joinedChannel = await prisma.chat.findUnique({
      where: { id: channel.id },
      include: {
        members: { include: { user: { select: { id: true, name: true, tag: true, avatar: true } } } },
        _count: { select: { members: true } },
      },
    });

    redisPub.publish('chat:member_added', JSON.stringify({
      chatId: channel.id,
      member: { userId: req.user!.userId },
    }));
    res.json({ ok: true, data: joinedChannel });
  } catch (err) {
    if (err instanceof z.ZodError) next(new ValidationError(err.errors[0].message));
    else next(err);
  }
});

// ── PATCH /chats/:id — Update group/channel info (OWNER/ADMIN only) ──
const updateChatSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  avatar: z.string().max(500).optional(),
  channelSlug: z.string().regex(/^[a-z0-9._-]{3,64}$/i, 'Ссылка канала: 3-64 символа (буквы, цифры, ., _, -)').optional(),
});

router.patch('/:id', authMiddleware, rateLimiter(20, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const chatId = req.params.id;
    const data = updateChatSchema.parse(req.body);

    const chat = await prisma.chat.findUnique({ where: { id: chatId }, select: { type: true } });
    if (!chat) throw new NotFoundError('Чат');
    if (chat.type === 'PRIVATE' || chat.type === 'SECRET') throw new ForbiddenError('Нельзя редактировать личные чаты');

    await requireChatRole(prisma, chatId, req.user!.userId, ['OWNER', 'ADMIN']);

    if (data.channelSlug !== undefined && chat.type !== 'CHANNEL') throw new ForbiddenError('Публичная ссылка доступна только для каналов');
    if (data.channelSlug !== undefined) {
      const existingSlug = await prisma.chat.findUnique({ where: { channelSlug: data.channelSlug }, select: { id: true } });
      if (existingSlug && existingSlug.id !== chatId) throw new ValidationError('Эта ссылка канала уже занята');
    }

    const updated = await prisma.chat.update({
      where: { id: chatId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.avatar !== undefined ? { avatar: data.avatar } : {}),
        ...(data.channelSlug !== undefined ? { channelSlug: data.channelSlug } : {}),
      },
      include: {
        members: { include: { user: { select: { id: true, name: true, tag: true, avatar: true } } } },
        _count: { select: { members: true } },
      },
    });

    // Broadcast update to all members via WebSocket
    redisPub.publish('chat:updated', JSON.stringify({
      chatId,
      name: updated.name,
      description: updated.description,
      avatar: updated.avatar,
      channelSlug: updated.channelSlug,
    }));

    await cacheInvalidate(`chat:${chatId}`);
    res.json({ ok: true, data: updated });
  } catch (err) {
    if (err instanceof z.ZodError) next(new ValidationError(err.errors[0].message));
    else next(err);
  }
});

// ── POST /chats/:id/members — Add member ──
router.post('/:id/members', authMiddleware, rateLimiter(30, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = z.object({ userId: z.string().uuid() }).parse(req.body);
    const chatId = req.params.id;

    const chat = await prisma.chat.findUnique({ where: { id: chatId }, select: { id: true, type: true } });
    if (!chat) throw new NotFoundError('Чат');
    if (chat.type === 'PRIVATE' || chat.type === 'SECRET') throw new ForbiddenError('Нельзя добавлять участников в личные чаты');

    await requireChatRole(prisma, chatId, req.user!.userId, ['OWNER', 'ADMIN']);
    const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { id: true } });
    if (!user) throw new ValidationError('Пользователь не найден');

    const member = await prisma.chatMember.upsert({
      where: { chatId_userId: { chatId, userId: payload.userId } },
      create: { chatId, userId: payload.userId, role: 'MEMBER' },
      update: {},
      include: { user: { select: { id: true, name: true, tag: true, avatar: true } } },
    });

    redisPub.publish('chat:member_added', JSON.stringify({ chatId, member }));
    await cacheInvalidate(`chat:${chatId}`);
    res.status(201).json({ ok: true, data: member });
  } catch (err) { next(err); }
});

// ── DELETE /chats/:id/members/:userId — Remove member or leave ──
router.delete('/:id/members/:userId', authMiddleware, rateLimiter(30, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: chatId, userId: targetId } = req.params;
    const myMembership = await requireChatMembership(prisma, chatId, req.user!.userId);
    const isLeavingSelf = targetId === req.user!.userId;

    if (!isLeavingSelf) {
      // Can't kick owner
      const targetMembership = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId, userId: targetId } } });
      if (!targetMembership) throw new NotFoundError('Участник');
      if (targetMembership.role === 'OWNER') throw new ForbiddenError('Нельзя удалить создателя');

      // Admin can't kick other admins, only owner can
      if (targetMembership.role === 'ADMIN' && myMembership.role !== 'OWNER') throw new ForbiddenError('Только создатель может удалить модератора');
      if (!['OWNER', 'ADMIN'].includes(myMembership.role)) throw new ForbiddenError();
    }

    await prisma.chatMember.deleteMany({ where: { chatId, userId: targetId } });
    redisPub.publish('chat:member_removed', JSON.stringify({ chatId, userId: targetId }));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── PATCH /chats/:id/members/:userId/role — Change member role ──
const roleSchema = z.object({
  role: z.enum(['ADMIN', 'MEMBER']),
});

router.patch('/:id/members/:userId/role', authMiddleware, rateLimiter(20, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: chatId, userId: targetId } = req.params;
    const { role: newRole } = roleSchema.parse(req.body);

    // Only OWNER can change roles
    await requireChatRole(prisma, chatId, req.user!.userId, ['OWNER']);

    // Can't change own role
    if (targetId === req.user!.userId) throw new ForbiddenError('Нельзя изменить свою роль');

    const target = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId, userId: targetId } } });
    if (!target) throw new NotFoundError('Участник');
    if (target.role === 'OWNER') throw new ForbiddenError('Нельзя изменить роль создателя');

    const updated = await prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId: targetId } },
      data: { role: newRole },
      include: { user: { select: { id: true, name: true, tag: true, avatar: true } } },
    });

    redisPub.publish('chat:member_updated', JSON.stringify({ chatId, userId: targetId, role: newRole }));
    await cacheInvalidate(`chat:${chatId}`);
    res.json({ ok: true, data: updated });
  } catch (err) {
    if (err instanceof z.ZodError) next(new ValidationError(err.errors[0].message));
    else next(err);
  }
});

// ── POST /chats/:id/transfer-ownership — Transfer ownership ──
router.post('/:id/transfer-ownership', authMiddleware, rateLimiter(5, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const chatId = req.params.id;
    const { userId: newOwnerId } = z.object({ userId: z.string().uuid() }).parse(req.body);

    await requireChatRole(prisma, chatId, req.user!.userId, ['OWNER']);

    if (newOwnerId === req.user!.userId) throw new ValidationError('Вы уже являетесь создателем');

    const newOwner = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId, userId: newOwnerId } } });
    if (!newOwner) throw new NotFoundError('Участник');

    await prisma.$transaction([
      // Current owner → ADMIN
      prisma.chatMember.update({
        where: { chatId_userId: { chatId, userId: req.user!.userId } },
        data: { role: 'ADMIN' },
      }),
      // New owner → OWNER
      prisma.chatMember.update({
        where: { chatId_userId: { chatId, userId: newOwnerId } },
        data: { role: 'OWNER' },
      }),
      // Update chat.createdBy
      prisma.chat.update({
        where: { id: chatId },
        data: { createdBy: newOwnerId },
      }),
    ]);

    redisPub.publish('chat:updated', JSON.stringify({ chatId, ownershipTransferred: true, newOwnerId }));
    await cacheInvalidate(`chat:${chatId}`);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── PATCH /chats/:id/mute ──
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
