import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../core/database';
import { authMiddleware } from '../../middleware/auth';
import { ForbiddenError, NotFoundError, ValidationError } from '../../core/errors';
import { rateLimiter } from '../../middleware/errorHandler';
import { ensureUuidArray, requireChatMembership, requireMessageInChat } from '../../core/security';

const router = Router();

async function resolveRootPost(chatId: string, messageId: string) {
  let current = await requireMessageInChat(prisma, messageId, chatId);
  while (current.replyToId) {
    current = await requireMessageInChat(prisma, current.replyToId, chatId);
  }
  return current;
}


router.get('/:chatId/messages', authMiddleware, rateLimiter(120, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { chatId } = req.params;
    const cursor = req.query.cursor as string | undefined;
    const topicId = req.query.topicId as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    await requireChatMembership(prisma, chatId, req.user!.userId);
    const chat = await prisma.chat.findUnique({ where: { id: chatId }, select: { type: true, topicsEnabled: true } });
    if (!chat) throw new NotFoundError('Чат');

    if (chat.type === 'GROUP' && chat.topicsEnabled && !topicId) throw new ValidationError('Для группы с темами укажите topicId');
    if ((!chat.topicsEnabled || chat.type !== 'GROUP') && topicId) throw new ValidationError('topicId доступен только для групп с темами');
    if (topicId) {
      const topic = await prisma.chatTopic.findFirst({ where: { id: topicId, chatId }, select: { id: true } });
      if (!topic) throw new NotFoundError('Тема');
    }

    const messages = await prisma.message.findMany({
      where: { chatId, deleted: false, ...(topicId ? { topicId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        from: { select: { id: true, name: true, tag: true, avatar: true } },
        replyTo: {
          select: {
            id: true, text: true, fromId: true,
            from: { select: { id: true, name: true } },
          },
        },
        media: {
          select: { id: true, type: true, originalName: true, mimeType: true, size: true, thumbnail: true, width: true, height: true },
        },
        reactions: {
          select: { emoji: true, userId: true },
        },
      },
    });

    const hasMore = messages.length > limit;
    if (hasMore) messages.pop();

    await prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId: req.user!.userId } },
      data: { lastRead: new Date() },
    });

    res.json({
      ok: true,
      data: {
        messages: messages.reverse(),
        hasMore,
        nextCursor: hasMore ? messages[0]?.id : null,
      },
    });
  } catch (err) { next(err); }
});

const sendSchema = z.object({
  text: z.string().max(4096).optional(),
  replyToId: z.string().uuid().optional(),
  forwardedFromId: z.string().uuid().optional(),
  encrypted: z.boolean().optional(),
  mediaIds: z.array(z.string().uuid()).max(10).optional(),
  commentsEnabled: z.boolean().optional(),
  topicId: z.string().uuid().optional(),
});

router.post('/:chatId/messages', authMiddleware, rateLimiter(40, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { chatId } = req.params;
    const data = sendSchema.parse(req.body);

    if (!data.text && !data.forwardedFromId && (!data.mediaIds || data.mediaIds.length === 0)) {
      throw new ValidationError('Сообщение пустое');
    }

    const membership = await requireChatMembership(prisma, chatId, req.user!.userId);
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: { type: true, topicsEnabled: true },
    });
    if (!chat) throw new NotFoundError('Чат');
    if (chat.type === 'GROUP' && chat.topicsEnabled) {
      if (!data.topicId) throw new ValidationError('Выберите тему для сообщения');
      const topic = await prisma.chatTopic.findFirst({ where: { id: data.topicId, chatId }, select: { id: true } });
      if (!topic) throw new NotFoundError('Тема');
    } else if (data.topicId) {
      throw new ValidationError('topicId доступен только для групп с темами');
    }

    if (chat.type === 'CHANNEL') {
      if (!data.replyToId && membership.role === 'MEMBER') {
        throw new ForbiddenError('В канале публиковать посты могут только администраторы и модераторы');
      }

      if (data.replyToId) {
        const rootPost = await resolveRootPost(chatId, data.replyToId);
        if (!rootPost.commentsEnabled) {
          throw new ForbiddenError('Комментарии для этого поста отключены');
        }
        if (membership.commentsMuted) {
          throw new ForbiddenError('Вам запрещено оставлять комментарии в этом канале');
        }
      }
    }

    let forwardedFromName: string | undefined;
    let forwardText = data.text;
    if (data.forwardedFromId) {
      const original = await prisma.message.findUnique({
        where: { id: data.forwardedFromId },
        include: { from: { select: { name: true } } },
      });
      if (!original || original.deleted) throw new NotFoundError('Пересылаемое сообщение');
      await requireChatMembership(prisma, original.chatId, req.user!.userId);
      forwardedFromName = original.from.name ?? undefined;
      forwardText = forwardText || original.text || undefined;
    }

    if (data.replyToId) {
      await requireMessageInChat(prisma, data.replyToId, chatId);
    }

    const inputMediaIds = ensureUuidArray(data.mediaIds || [], 'mediaIds');

    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          chatId,
          fromId: req.user!.userId,
          text: forwardText || null,
          replyToId: data.replyToId || undefined,
          forwardedFromId: data.forwardedFromId || undefined,
          forwardedFromName,
          encrypted: data.encrypted || false,
          commentsEnabled: chat.type === 'CHANNEL' && !data.replyToId ? (data.commentsEnabled ?? true) : true,
          topicId: data.topicId || null,
        },
      });

      if (inputMediaIds.length > 0) {
        const ownedMedia = await tx.mediaFile.findMany({
          where: { id: { in: inputMediaIds }, uploaderId: req.user!.userId, messageId: null },
          select: { id: true },
        });
        if (ownedMedia.length !== inputMediaIds.length) {
          throw new ForbiddenError('Есть чужие или уже привязанные файлы');
        }

        await tx.mediaFile.updateMany({
          where: { id: { in: inputMediaIds }, uploaderId: req.user!.userId, messageId: null },
          data: { messageId: created.id },
        });
      }

      return tx.message.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          from: { select: { id: true, name: true, tag: true, avatar: true } },
          replyTo: {
            select: {
              id: true, text: true, fromId: true,
              from: { select: { id: true, name: true } },
            },
          },
          media: true,
          reactions: { select: { emoji: true, userId: true } },
        },
      });
    });

    await prisma.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });

    res.status(201).json({ ok: true, data: message });
  } catch (err) {
    if (err instanceof z.ZodError) next(new ValidationError(err.errors[0].message));
    else next(err);
  }
});

const editSchema = z.object({ text: z.string().min(1).max(4096) });

router.patch('/:chatId/messages/:id', authMiddleware, rateLimiter(30, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, chatId } = req.params;
    const { text } = editSchema.parse(req.body);

    await requireChatMembership(prisma, chatId, req.user!.userId);
    const message = await requireMessageInChat(prisma, id, chatId);
    if (message.fromId !== req.user!.userId) throw new ForbiddenError();

    const updated = await prisma.message.update({
      where: { id },
      data: { text, edited: true },
      include: {
        from: { select: { id: true, name: true, tag: true, avatar: true } },
        replyTo: { select: { id: true, text: true, fromId: true, from: { select: { name: true } } } },
        media: true,
        reactions: { select: { emoji: true, userId: true } },
      },
    });

    res.json({ ok: true, data: updated });
  } catch (err) { next(err); }
});

router.delete('/:chatId/messages/:id', authMiddleware, rateLimiter(30, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, chatId } = req.params;

    const membership = await requireChatMembership(prisma, chatId, req.user!.userId);
    const message = await requireMessageInChat(prisma, id, chatId, true);

    if (message.fromId !== req.user!.userId && membership.role === 'MEMBER') {
      throw new ForbiddenError();
    }

    await prisma.$transaction(async (tx) => {
      await tx.message.update({ where: { id }, data: { deleted: true, text: null } });
      await tx.mediaFile.deleteMany({ where: { messageId: id } });
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/:chatId/messages/search', authMiddleware, rateLimiter(60, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { chatId } = req.params;
    const q = (req.query.q as string || '').trim();
    if (q.length < 2) { res.json({ ok: true, data: [] }); return; }

    await requireChatMembership(prisma, chatId, req.user!.userId);

    const messages = await prisma.message.findMany({
      where: {
        chatId,
        deleted: false,
        text: { contains: q, mode: 'insensitive' },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        from: { select: { id: true, name: true, tag: true } },
      },
    });

    res.json({ ok: true, data: messages });
  } catch (err) { next(err); }
});

const reactionSchema = z.object({
  emoji: z.string().min(1).max(16),
});

router.post('/:chatId/messages/:id/reactions', authMiddleware, rateLimiter(120, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { chatId, id: messageId } = req.params;
    const { emoji } = reactionSchema.parse(req.body);

    await requireChatMembership(prisma, chatId, req.user!.userId);
    await requireMessageInChat(prisma, messageId, chatId);

    const existing = await prisma.messageReaction.findUnique({
      where: { messageId_userId_emoji: { messageId, userId: req.user!.userId, emoji } },
      select: { id: true },
    });

    if (existing) {
      await prisma.messageReaction.delete({ where: { messageId_userId_emoji: { messageId, userId: req.user!.userId, emoji } } });
    } else {
      await prisma.messageReaction.create({
        data: { messageId, userId: req.user!.userId, emoji },
      });
    }

    const reactions = await prisma.messageReaction.findMany({
      where: { messageId },
      select: { emoji: true, userId: true },
    });

    res.json({ ok: true, data: { messageId, reactions } });
  } catch (err) {
    if (err instanceof z.ZodError) next(new ValidationError(err.errors[0].message));
    else next(err);
  }
});

export default router;
