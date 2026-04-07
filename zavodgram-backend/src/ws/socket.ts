import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../core/logger';
import { prisma } from '../core/database';
import { setUserOnline, setUserOffline, setTyping, redisPub, redisSub } from '../core/redis';
import { createNotification } from '../modules/notifications/notifications.routes';
import { AuthPayload } from '../middleware/auth';

interface AuthSocket extends Socket {
  user?: AuthPayload;
}

export function setupWebSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: config.corsOrigin,
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // ── Auth middleware для WebSocket ──
  io.use((socket: AuthSocket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token) return next(new Error('AUTH_REQUIRED'));

    try {
      const payload = jwt.verify(token, config.jwt.secret) as AuthPayload;
      socket.user = payload;
      next();
    } catch {
      next(new Error('AUTH_INVALID'));
    }
  });

  // ── Redis Pub/Sub для масштабирования на несколько инстансов ──
  redisSub.subscribe('chat:message', 'chat:typing', 'chat:status', 'chat:edit', 'chat:delete');

  redisSub.on('message', (channel, data) => {
    const parsed = JSON.parse(data);
    switch (channel) {
      case 'chat:message':
        io.to(`chat:${parsed.chatId}`).emit('message:new', parsed);
        break;
      case 'chat:typing':
        io.to(`chat:${parsed.chatId}`).emit('user:typing', parsed);
        break;
      case 'chat:status':
        io.emit('user:status', parsed); // Broadcast online/offline
        break;
      case 'chat:edit':
        io.to(`chat:${parsed.chatId}`).emit('message:edited', parsed);
        break;
      case 'chat:delete':
        io.to(`chat:${parsed.chatId}`).emit('message:deleted', parsed);
        break;
    }
  });

  // ── Connection handler ──
  io.on('connection', async (socket: AuthSocket) => {
    const userId = socket.user!.userId;
    logger.info(`WS connected: ${userId}`);

    // Устанавливаем онлайн
    await setUserOnline(userId);
    await prisma.user.update({ where: { id: userId }, data: { online: true } });
    redisPub.publish('chat:status', JSON.stringify({ userId, online: true }));

    // Подключаем к комнатам всех чатов пользователя
    const memberships = await prisma.chatMember.findMany({
      where: { userId },
      select: { chatId: true },
    });
    memberships.forEach((m) => socket.join(`chat:${m.chatId}`));
    socket.join(`user:${userId}`);

    // ── Отправка сообщения ──
    socket.on('message:send', async (data: {
      chatId: string;
      text?: string;
      replyToId?: string;
      forwardedFromId?: string;
      encrypted?: boolean;
    }) => {
      try {
        // Проверяем членство
        const membership = await prisma.chatMember.findUnique({
          where: { chatId_userId: { chatId: data.chatId, userId } },
        });
        if (!membership) return socket.emit('error', { message: 'Нет доступа' });

        // Пересылка
        let forwardedFromName: string | null = null;
        let text = data.text;
        if (data.forwardedFromId) {
          const orig = await prisma.message.findUnique({
            where: { id: data.forwardedFromId },
            include: { from: { select: { name: true } } },
          });
          if (orig) { forwardedFromName = orig.from.name; text = text || orig.text || undefined; }
        }

        const message = await prisma.message.create({
          data: {
            chatId: data.chatId,
            fromId: userId,
            text: text || null,
            replyToId: data.replyToId || undefined,
            forwardedFromId: data.forwardedFromId || undefined,
            forwardedFromName: forwardedFromName || undefined,
            encrypted: data.encrypted || false,
          },
          include: {
            from: { select: { id: true, name: true, tag: true, avatar: true } },
            replyTo: { select: { id: true, text: true, fromId: true, from: { select: { name: true } } } },
            media: true,
          },
        });

        await prisma.chat.update({ where: { id: data.chatId }, data: { updatedAt: new Date() } });

        // Публикуем через Redis (для масштабирования)
        redisPub.publish('chat:message', JSON.stringify({ ...message, chatId: data.chatId }));

        // Уведомления участникам (кроме отправителя и замьюченных)
        const chatMembers = await prisma.chatMember.findMany({
          where: { chatId: data.chatId, userId: { not: userId }, muted: false },
          select: { userId: true },
        });

        const chat = await prisma.chat.findUnique({ where: { id: data.chatId }, select: { name: true, type: true } });
        const senderName = message.from.name;

        for (const member of chatMembers) {
          await createNotification({
            userId: member.userId,
            type: 'NEW_MESSAGE',
            title: chat?.name || senderName,
            body: `${senderName}: ${(text || '[медиа]').slice(0, 100)}`,
            data: { chatId: data.chatId, messageId: message.id },
          });

          // Push через WebSocket
          io.to(`user:${member.userId}`).emit('notification', {
            chatId: data.chatId,
            chatName: chat?.name || senderName,
            fromName: senderName,
            text: (text || '[медиа]').slice(0, 100),
          });
        }

        // Подтверждение отправителю
        socket.emit('message:sent', { tempId: data.chatId, message });
      } catch (err) {
        logger.error('WS message:send error', { error: (err as Error).message });
        socket.emit('error', { message: 'Ошибка отправки' });
      }
    });

    // ── Редактирование ──
    socket.on('message:edit', async (data: { messageId: string; chatId: string; text: string }) => {
      try {
        const msg = await prisma.message.findUnique({ where: { id: data.messageId } });
        if (!msg || msg.fromId !== userId) return;

        const updated = await prisma.message.update({
          where: { id: data.messageId },
          data: { text: data.text, edited: true },
        });

        redisPub.publish('chat:edit', JSON.stringify({ ...updated, chatId: data.chatId }));
      } catch (err) {
        logger.error('WS message:edit error', { error: (err as Error).message });
      }
    });

    // ── Удаление ──
    socket.on('message:delete', async (data: { messageId: string; chatId: string }) => {
      try {
        const msg = await prisma.message.findUnique({ where: { id: data.messageId } });
        if (!msg || msg.fromId !== userId) return;

        await prisma.message.update({ where: { id: data.messageId }, data: { deleted: true, text: null } });
        redisPub.publish('chat:delete', JSON.stringify({ messageId: data.messageId, chatId: data.chatId }));
      } catch (err) {
        logger.error('WS message:delete error', { error: (err as Error).message });
      }
    });

    // ── Набор текста ──
    socket.on('typing:start', async (data: { chatId: string }) => {
      await setTyping(data.chatId, userId);
      redisPub.publish('chat:typing', JSON.stringify({ chatId: data.chatId, userId, typing: true }));
    });

    // ── Прочитано ──
    socket.on('message:read', async (data: { chatId: string; messageId: string }) => {
      await prisma.chatMember.updateMany({
        where: { chatId: data.chatId, userId },
        data: { lastRead: new Date() },
      });

      // Уведомляем отправителя о прочтении
      const msg = await prisma.message.findUnique({ where: { id: data.messageId } });
      if (msg && msg.fromId !== userId) {
        await prisma.message.update({ where: { id: data.messageId }, data: { status: 'READ' } });
        io.to(`user:${msg.fromId}`).emit('message:status', {
          messageId: data.messageId,
          chatId: data.chatId,
          status: 'READ',
        });
      }
    });

    // ── Присоединение к новому чату (после создания) ──
    socket.on('chat:join', (data: { chatId: string }) => {
      socket.join(`chat:${data.chatId}`);
    });

    // ── Отключение ──
    socket.on('disconnect', async () => {
      logger.info(`WS disconnected: ${userId}`);
      await setUserOffline(userId);
      await prisma.user.update({ where: { id: userId }, data: { online: false, lastSeen: new Date() } });
      redisPub.publish('chat:status', JSON.stringify({ userId, online: false }));
    });
  });

  logger.info('✓ WebSocket server initialized');
  return io;
}
