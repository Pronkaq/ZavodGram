import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../core/database';
import { authMiddleware } from '../../middleware/auth';
import { ForbiddenError, NotFoundError, ValidationError } from '../../core/errors';

const router = Router();

// ── GET /chats/:chatId/messages — Получить сообщения (с пагинацией) ──
router.get('/:chatId/messages', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { chatId } = req.params;
    const cursor = req.query.cursor as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    // Проверяем членство
    const membership = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.user!.userId } },
    });
    if (!membership) throw new ForbiddenError();

    const messages = await prisma.message.findMany({
      where: { chatId, deleted: false },
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
          select: { id: true, type: true, filename: true, originalName: true, mimeType: true, size: true, url: true, thumbnail: true, width: true, height: true },
        },
      },
    });

    const hasMore = messages.length > limit;
    if (hasMore) messages.pop();

    // Обновляем lastRead
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

// ── POST /chats/:chatId/messages — Отправить сообщение ──
const sendSchema = z.object({
  text: z.string().max(4096).optional(),
  replyToId: z.string().uuid().optional(),
  forwardedFromId: z.string().uuid().optional(),
  encrypted: z.boolean().optional(),
});

router.post('/:chatId/messages', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { chatId } = req.params;
    const data = sendSchema.parse(req.body);

    if (!data.text && !data.forwardedFromId) throw new ValidationError('Сообщение пустое');

    // Проверяем членство
    const membership = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.user!.userId } },
    });
    if (!membership) throw new ForbiddenError();

    // Если пересылка — достаём оригинал
    let forwardedFromName: string | null = null;
    let forwardText = data.text;
    if (data.forwardedFromId) {
      const original = await prisma.message.findUnique({
        where: { id: data.forwardedFromId },
        include: { from: { select: { name: true } } },
      });
      if (original) {
        forwardedFromName = original.from.name;
        forwardText = forwardText || original.text || undefined;
      }
    }

    const message = await prisma.message.create({
      data: {
        chatId,
        fromId: req.user!.userId,
        text: forwardText || null,
        replyToId: data.replyToId || undefined,
        forwardedFromId: data.forwardedFromId || undefined,
        forwardedFromName,
        encrypted: data.encrypted || false,
      },
      include: {
        from: { select: { id: true, name: true, tag: true, avatar: true } },
        replyTo: {
          select: {
            id: true, text: true, fromId: true,
            from: { select: { id: true, name: true } },
          },
        },
        media: true,
      },
    });

    // Обновляем updatedAt чата для сортировки
    await prisma.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });

    res.status(201).json({ ok: true, data: message });
  } catch (err) {
    if (err instanceof z.ZodError) next(new ValidationError(err.errors[0].message));
    else next(err);
  }
});

// ── PATCH /chats/:chatId/messages/:id — Редактировать ──
router.patch('/:chatId/messages/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { text } = req.body;

    const message = await prisma.message.findUnique({ where: { id } });
    if (!message) throw new NotFoundError('Сообщение');
    if (message.fromId !== req.user!.userId) throw new ForbiddenError();

    const updated = await prisma.message.update({
      where: { id },
      data: { text, edited: true },
      include: {
        from: { select: { id: true, name: true, tag: true, avatar: true } },
        replyTo: { select: { id: true, text: true, fromId: true, from: { select: { name: true } } } },
        media: true,
      },
    });

    res.json({ ok: true, data: updated });
  } catch (err) { next(err); }
});

// ── DELETE /chats/:chatId/messages/:id — Удалить ──
router.delete('/:chatId/messages/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, chatId } = req.params;

    const message = await prisma.message.findUnique({ where: { id } });
    if (!message) throw new NotFoundError('Сообщение');

    // Удалить может автор или админ/владелец чата
    if (message.fromId !== req.user!.userId) {
      const membership = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId, userId: req.user!.userId } },
      });
      if (!membership || membership.role === 'MEMBER') throw new ForbiddenError();
    }

    // Soft delete
    await prisma.message.update({ where: { id }, data: { deleted: true, text: null } });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── GET /chats/:chatId/messages/search?q=... — Поиск по сообщениям ──
router.get('/:chatId/messages/search', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { chatId } = req.params;
    const q = (req.query.q as string || '').trim();
    if (q.length < 2) { res.json({ ok: true, data: [] }); return; }

    const membership = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.user!.userId } },
    });
    if (!membership) throw new ForbiddenError();

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

export default router;
