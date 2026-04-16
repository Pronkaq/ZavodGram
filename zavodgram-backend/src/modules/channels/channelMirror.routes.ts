// src/modules/channels/channelMirror.routes.ts
//
// Роут: POST /api/channels/mirror
// Позволяет любому пользователю подключить зеркало публичного
// Telegram-канала в свой канал в мессенджере.
//
// Зарегистрируй в server.ts:
//   import channelMirrorRoutes from './modules/channels/channelMirror.routes';
//   app.use('/api/channels', channelMirrorRoutes);

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../core/database';
import { authMiddleware } from '../../middleware/auth';
import { rateLimiter } from '../../middleware/errorHandler';
import { ValidationError, ForbiddenError, NotFoundError } from '../../core/errors';
import { logger } from '../../core/logger';

const router = Router();

// Максимум зеркал на пользователя
const USER_MIRROR_LIMIT = 5;

const mirrorRepo = (prisma as any).telegramChannelMirrorState as {
  findMany: Function;
  findFirst: Function;
  upsert: Function;
  update: Function;
  delete: Function;
  count: Function;
} | undefined;

const createMirrorSchema = z.object({
  // sourceSlug — username публичного TG-канала (без @)
  sourceSlug: z
    .string()
    .trim()
    .min(3, 'Минимум 3 символа')
    .max(64, 'Максимум 64 символа')
    .regex(/^[a-zA-Z0-9_]+$/, 'Только буквы, цифры и _'),
  // Название канала в мессенджере (если не указано — берём sourceSlug)
  channelName: z.string().trim().min(1).max(100).optional(),
  // Публичная ссылка нового канала (необязательно)
  channelSlug: z
    .string()
    .regex(/^[a-z0-9._-]{3,64}$/i, 'Ссылка: 3-64 символа (буквы, цифры, ., _, -)')
    .optional(),
});

// Проверяем что TG-канал существует и публичный — делаем HEAD-запрос
async function assertTelegramChannelExists(sourceSlug: string): Promise<{ name: string; description: string }> {
  const url = `https://t.me/s/${sourceSlug}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ZavodGramMirror/1.0)' },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new ValidationError('Telegram-канал не найден или не является публичным');
  }

  const html = await response.text();

  // Парсим название канала
  const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
  const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/);

  if (!titleMatch) {
    throw new ValidationError('Не удалось получить данные канала. Убедитесь что канал публичный');
  }

  return {
    name: titleMatch[1] || sourceSlug,
    description: descMatch?.[1] || '',
  };
}

// GET /api/channels/mirror/preview?slug=username — проверить TG-канал
// Нужен потому что браузер не может напрямую обращаться к t.me (CORS)
router.get(
  '/mirror/preview',
  authMiddleware,
  rateLimiter(30, 60),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const slug = z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9_]+$/).parse(req.query.slug);

      const response = await fetch(`https://t.me/s/${slug}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ZavodGramMirror/1.0)' },
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        throw new ValidationError('Канал не найден или не является публичным');
      }

      const html = await response.text();
      const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
      const descMatch  = html.match(/<meta property="og:description" content="([^"]+)"/);

      if (!titleMatch) {
        throw new ValidationError('Канал не найден или не является публичным');
      }

      res.json({
        ok: true,
        data: {
          slug,
          name: titleMatch[1],
          description: descMatch?.[1] || '',
          url: `https://t.me/${slug}`,
        },
      });
    } catch (err) {
      if (err instanceof z.ZodError) next(new ValidationError('Некорректный username'));
      else next(err);
    }
  }
);

// POST /api/channels/mirror — создать зеркало
router.post(
  '/mirror',
  authMiddleware,
  rateLimiter(5, 60), // 5 создания в минуту
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!mirrorRepo) {
        throw new ValidationError('Функция зеркалирования недоступна');
      }

      const data = createMirrorSchema.parse(req.body);
      const userId = req.user!.userId;

      // Проверяем лимит зеркал на пользователя
      const existingCount = await mirrorRepo.count({
        where: { createdByUserId: userId, enabled: true },
      });

      if (existingCount >= USER_MIRROR_LIMIT) {
        throw new ForbiddenError(
          `Максимум ${USER_MIRROR_LIMIT} зеркал на аккаунт. Удалите одно из существующих чтобы добавить новое`
        );
      }

      const channelName = data.channelName || `@${data.sourceSlug}`;

      // Проверяем уникальность slug если указан
      if (data.channelSlug) {
        const existingSlug = await prisma.chat.findUnique({
          where: { channelSlug: data.channelSlug },
        });
        if (existingSlug) {
          throw new ValidationError('Эта публичная ссылка уже занята');
        }
      }

      // Транзакция: создаём канал + запись зеркала
      const result = await prisma.$transaction(async (tx) => {
        // Создаём канал
        const channel = await tx.chat.create({
          data: {
            type: 'CHANNEL',
            name: channelName,
            description: `Зеркало Telegram-канала @${data.sourceSlug}`,
            channelSlug: data.channelSlug || null,
            createdBy: userId,
            members: {
              create: { userId, role: 'OWNER' },
            },
          },
        });

        // Создаём запись зеркала
        const mirror = await (mirrorRepo as any).upsert({
          where: {
            sourceSlug_targetChatId: {
              sourceSlug: data.sourceSlug,
              targetChatId: channel.id,
            },
          },
          create: {
            sourceSlug: data.sourceSlug,
            targetChatId: channel.id,
            createdByUserId: userId,
            enabled: true,
          },
          update: {
            enabled: true,
          },
        });

        return { channel, mirror };
      });

      logger.info('User created TG mirror', {
        userId,
        sourceSlug: data.sourceSlug,
        channelId: result.channel.id,
        mirrorId: result.mirror.id,
      });

      res.status(201).json({
        ok: true,
        data: {
          channel: result.channel,
          mirror: {
            id: result.mirror.id,
            sourceSlug: result.mirror.sourceSlug,
            enabled: result.mirror.enabled,
          },
        },
      });
    } catch (err) {
      if (err instanceof z.ZodError) next(new ValidationError(err.errors[0].message));
      else next(err);
    }
  }
);

// GET /api/channels/mirror — список моих зеркал
router.get(
  '/mirror',
  authMiddleware,
  rateLimiter(30, 60),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!mirrorRepo) throw new ValidationError('Функция зеркалирования недоступна');

      const userId = req.user!.userId;
      const mirrors = await mirrorRepo.findMany({
        where: { createdByUserId: userId },
        orderBy: { createdAt: 'desc' },
      });

      const chatIds = mirrors.map((m: any) => m.targetChatId);
      const chats = chatIds.length > 0
        ? await prisma.chat.findMany({
            where: { id: { in: chatIds } },
            select: { id: true, name: true, channelSlug: true, avatar: true },
          })
        : [];
      const chatMap = new Map(chats.map((c) => [c.id, c]));

      res.json({
        ok: true,
        data: mirrors.map((m: any) => ({
          id: m.id,
          sourceSlug: m.sourceSlug,
          enabled: m.enabled,
          lastSyncAt: m.lastSyncAt,
          lastImportedPostId: m.lastImportedPostId,
          createdAt: m.createdAt,
          channel: chatMap.get(m.targetChatId) || null,
        })),
        meta: {
          total: mirrors.length,
          limit: USER_MIRROR_LIMIT,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/channels/mirror/:id — удалить зеркало
router.delete(
  '/mirror/:id',
  authMiddleware,
  rateLimiter(10, 60),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!mirrorRepo) throw new ValidationError('Функция зеркалирования недоступна');

      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const userId = req.user!.userId;

      const mirror = await mirrorRepo.findFirst({ where: { id } });
      if (!mirror) throw new NotFoundError('Зеркало');

      // Только создатель может удалить
      if (mirror.createdByUserId !== userId) {
        throw new ForbiddenError('Нет доступа');
      }

      // Отключаем зеркало (не удаляем канал — пользователь сам решит)
      await mirrorRepo.update({
        where: { id },
        data: { enabled: false },
      });

      res.json({ ok: true, data: { id, disabled: true } });
    } catch (err) {
      if (err instanceof z.ZodError) next(new ValidationError(err.errors[0].message));
      else next(err);
    }
  }
);

export default router;
