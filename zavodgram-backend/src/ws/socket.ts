import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../core/logger';
import { prisma } from '../core/database';
import { setUserOnline, setUserOffline, setTyping, redisPub, redisSub } from '../core/redis';
import { createNotification } from '../modules/notifications/notifications.routes';
import { AuthPayload } from '../middleware/auth';
import { requireChatMembership, requireMessageInChat } from '../core/security';

interface AuthSocket extends Socket {
  user?: AuthPayload;
}

const socketWindow = new Map<string, { count: number; resetAt: number }>();

function enforceSocketRate(userId: string, action: string, limit: number, windowMs: number) {
  const now = Date.now();
  const key = `${userId}:${action}`;
  const current = socketWindow.get(key);

  if (!current || current.resetAt <= now) {
    socketWindow.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

async function resolveRootPost(chatId: string, messageId: string) {
  let current = await requireMessageInChat(prisma, messageId, chatId);
  while (current.replyToId) {
    current = await requireMessageInChat(prisma, current.replyToId, chatId);
  }
  return current;
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

  redisSub.subscribe('chat:message', 'chat:typing', 'chat:status', 'chat:edit', 'chat:delete', 'chat:updated', 'chat:member_added', 'chat:member_removed', 'chat:member_updated', 'chat:reaction');

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
        io.emit('user:status', parsed);
        break;
      case 'chat:edit':
        io.to(`chat:${parsed.chatId}`).emit('message:edited', parsed);
        break;
      case 'chat:delete':
        io.to(`chat:${parsed.chatId}`).emit('message:deleted', parsed);
        break;
      case 'chat:updated':
        io.to(`chat:${parsed.chatId}`).emit('chat:updated', parsed);
        break;
      case 'chat:member_added':
        io.to(`chat:${parsed.chatId}`).emit('chat:member_added', parsed);
        // Make the new member join the room
        const addedUserId = parsed.member?.userId || parsed.member?.user?.id;
        if (addedUserId) {
          const sockets = io.sockets.sockets;
          sockets.forEach((s: any) => { if (s.user?.userId === addedUserId) s.join(`chat:${parsed.chatId}`); });
        }
        break;
      case 'chat:member_removed':
        io.to(`chat:${parsed.chatId}`).emit('chat:member_removed', parsed);
        break;
      case 'chat:member_updated':
        io.to(`chat:${parsed.chatId}`).emit('chat:member_updated', parsed);
        break;
      case 'chat:reaction':
        io.to(`chat:${parsed.chatId}`).emit('message:reaction', parsed);
        break;
    }
  });

  io.on('connection', async (socket: AuthSocket) => {
    const userId = socket.user!.userId;
    logger.info(`WS connected: ${userId}`);

    await setUserOnline(userId);
    await prisma.user.update({ where: { id: userId }, data: { online: true } });
    redisPub.publish('chat:status', JSON.stringify({ userId, online: true }));

    const memberships = await prisma.chatMember.findMany({
      where: { userId },
      select: { chatId: true },
    });
    memberships.forEach((m) => socket.join(`chat:${m.chatId}`));
    socket.join(`user:${userId}`);

    socket.on('message:send', async (data: {
      chatId: string;
      text?: string;
      replyToId?: string;
      forwardedFromId?: string;
      encrypted?: boolean;
      commentsEnabled?: boolean;
      topicId?: string;
    }) => {
      try {
        if (!enforceSocketRate(userId, 'message:send', 40, 60000)) return;
        const membership = await requireChatMembership(prisma, data.chatId, userId);
        const chatMeta = await prisma.chat.findUnique({
          where: { id: data.chatId },
          select: { type: true, topicsEnabled: true },
        });
        if (!chatMeta) return socket.emit('error', { message: 'Чат не найден' });
        if (chatMeta.type === 'GROUP' && chatMeta.topicsEnabled) {
          if (!data.topicId) return socket.emit('error', { message: 'Выберите тему для сообщения' });
          const topic = await prisma.chatTopic.findFirst({ where: { id: data.topicId, chatId: data.chatId }, select: { id: true } });
          if (!topic) return socket.emit('error', { message: 'Тема не найдена' });
        } else if (data.topicId) {
          return socket.emit('error', { message: 'topicId доступен только для групп с темами' });
        }

        if (chatMeta.type === 'CHANNEL') {
          if (!data.replyToId && membership.role === 'MEMBER') {
            return socket.emit('error', { message: 'В канале могут публиковать только администраторы и модераторы' });
          }

          if (data.replyToId) {
            const rootPost = await resolveRootPost(data.chatId, data.replyToId);
            if (!rootPost.commentsEnabled) {
              return socket.emit('error', { message: 'Комментарии для этого поста отключены' });
            }
            if (membership.commentsMuted) {
              return socket.emit('error', { message: 'Вам запрещено оставлять комментарии в этом канале' });
            }
          }
        }

        let forwardedFromName: string | undefined;
        let text = data.text;
        if (data.forwardedFromId) {
          const orig = await prisma.message.findUnique({
            where: { id: data.forwardedFromId },
            include: {
              from: { select: { name: true } },
              chat: { select: { type: true, contentProtectionEnabled: true } },
            },
          });
          if (!orig || orig.deleted) return socket.emit('error', { message: 'Источник пересылки не найден' });
          if (
            orig.chat?.contentProtectionEnabled
            && (orig.chat.type === 'PRIVATE' || orig.chat.type === 'SECRET')
          ) {
            return socket.emit('error', { message: 'Пересылка из защищённого личного чата запрещена' });
          }
          await requireChatMembership(prisma, orig.chatId, userId);
          forwardedFromName = orig.from.name ?? undefined;
          text = text || orig.text || undefined;
        }

        if (data.replyToId) {
          await requireMessageInChat(prisma, data.replyToId, data.chatId);
        }

        const message = await prisma.message.create({
          data: {
            chatId: data.chatId,
            fromId: userId,
            text: text || null,
            replyToId: data.replyToId || undefined,
            forwardedFromId: data.forwardedFromId || undefined,
            forwardedFromName,
            encrypted: data.encrypted || false,
            commentsEnabled: chatMeta.type === 'CHANNEL' && !data.replyToId ? (data.commentsEnabled ?? true) : true,
            topicId: data.topicId || null,
          },
          include: {
            from: { select: { id: true, name: true, tag: true, avatar: true } },
            replyTo: { select: { id: true, text: true, fromId: true, from: { select: { name: true } } } },
            media: true,
            reactions: { select: { emoji: true, userId: true } },
          },
        });

        await prisma.chat.update({ where: { id: data.chatId }, data: { updatedAt: new Date() } });

        redisPub.publish('chat:message', JSON.stringify({ ...message, chatId: data.chatId }));

        const chatMembers = await prisma.chatMember.findMany({
          where: { chatId: data.chatId, userId: { not: userId }, muted: false },
          select: { userId: true },
        });

        const chat = await prisma.chat.findUnique({ where: { id: data.chatId }, select: { name: true } });
        const senderName = message.from.name;

        const BATCH_SIZE = 50;
        const notificationText = (text || '[медиа]').slice(0, 100);
        const notificationBody = `${senderName}: ${notificationText}`;
        for (let i = 0; i < chatMembers.length; i += BATCH_SIZE) {
          const batch = chatMembers.slice(i, i + BATCH_SIZE);
          await Promise.allSettled(
            batch.map(async (member) => {
              await createNotification({
                userId: member.userId,
                type: 'NEW_MESSAGE',
                title: chat?.name || senderName,
                body: notificationBody,
                data: { chatId: data.chatId, messageId: message.id },
              });

              io.to(`user:${member.userId}`).emit('notification', {
                chatId: data.chatId,
                chatName: chat?.name || senderName,
                fromName: senderName,
                text: notificationText,
              });
            })
          );
        }

        socket.emit('message:sent', { tempId: data.chatId, message });
      } catch (err) {
        logger.error('WS message:send error', { error: (err as Error).message });
        socket.emit('error', { message: 'Ошибка отправки' });
      }
    });

    socket.on('message:edit', async (data: { messageId: string; chatId: string; text: string }) => {
      try {
        if (!enforceSocketRate(userId, 'message:edit', 30, 60000)) return;
        await requireChatMembership(prisma, data.chatId, userId);

        const msg = await requireMessageInChat(prisma, data.messageId, data.chatId);
        if (msg.fromId !== userId) return;

        const updated = await prisma.message.update({
          where: { id: data.messageId },
          data: { text: data.text.slice(0, 4096), edited: true },
        });

        redisPub.publish('chat:edit', JSON.stringify({ ...updated, chatId: data.chatId }));
      } catch (err) {
        logger.error('WS message:edit error', { error: (err as Error).message });
      }
    });

    socket.on('message:delete', async (data: { messageId: string; chatId: string }) => {
      try {
        if (!enforceSocketRate(userId, 'message:delete', 30, 60000)) return;
        const membership = await requireChatMembership(prisma, data.chatId, userId);
        const chat = await prisma.chat.findUnique({
          where: { id: data.chatId },
          select: { type: true, contentProtectionEnabled: true },
        });
        if (!chat) return;
        if (chat.contentProtectionEnabled && (chat.type === 'PRIVATE' || chat.type === 'SECRET')) return;
        const msg = await requireMessageInChat(prisma, data.messageId, data.chatId, true);

        if (msg.fromId !== userId && membership.role === 'MEMBER') return;

        await prisma.message.update({ where: { id: data.messageId }, data: { deleted: true, text: null } });
        redisPub.publish('chat:delete', JSON.stringify({ messageId: data.messageId, chatId: data.chatId }));
      } catch (err) {
        logger.error('WS message:delete error', { error: (err as Error).message });
      }
    });

    socket.on('typing:start', async (data: { chatId: string }) => {
      if (!enforceSocketRate(userId, 'typing:start', 100, 60000)) return;
      try {
        await requireChatMembership(prisma, data.chatId, userId);
        await setTyping(data.chatId, userId);
        redisPub.publish('chat:typing', JSON.stringify({ chatId: data.chatId, userId, typing: true }));
      } catch {
        return;
      }
    });

    socket.on('message:react', async (data: { chatId: string; messageId: string; emoji: string }) => {
      try {
        if (!enforceSocketRate(userId, 'message:react', 120, 60000)) return;
        if (!data.emoji || data.emoji.length > 16) return;
        await requireChatMembership(prisma, data.chatId, userId);
        await requireMessageInChat(prisma, data.messageId, data.chatId);

        const existing = await prisma.messageReaction.findUnique({
          where: { messageId_userId_emoji: { messageId: data.messageId, userId, emoji: data.emoji } },
          select: { id: true },
        });

        if (existing) {
          await prisma.messageReaction.delete({
            where: { messageId_userId_emoji: { messageId: data.messageId, userId, emoji: data.emoji } },
          });
        } else {
          await prisma.messageReaction.create({
            data: { messageId: data.messageId, userId, emoji: data.emoji },
          });
        }

        const reactions = await prisma.messageReaction.findMany({
          where: { messageId: data.messageId },
          select: { emoji: true, userId: true },
        });

        redisPub.publish('chat:reaction', JSON.stringify({
          chatId: data.chatId,
          messageId: data.messageId,
          reactions,
        }));
      } catch (err) {
        logger.error('WS message:react error', { error: (err as Error).message });
      }
    });

    socket.on('message:read', async (data: { chatId: string; messageId: string }) => {
      try {
        if (!enforceSocketRate(userId, 'message:read', 100, 60000)) return;
        await requireChatMembership(prisma, data.chatId, userId);

        let messageToMarkId = data.messageId;
        if (data.messageId === 'latest') {
          const latestMessage = await prisma.message.findFirst({
            where: { chatId: data.chatId, deleted: false },
            orderBy: { createdAt: 'desc' },
            select: { id: true },
          });
          if (!latestMessage) return;
          messageToMarkId = latestMessage.id;
        }

        const msg = await requireMessageInChat(prisma, messageToMarkId, data.chatId);

        await prisma.chatMember.update({
          where: { chatId_userId: { chatId: data.chatId, userId } },
          data: { lastRead: new Date() },
        });

        if (msg.fromId !== userId) {
          await prisma.message.update({ where: { id: messageToMarkId }, data: { status: 'READ' } });
          io.to(`user:${msg.fromId}`).emit('message:status', {
            messageId: messageToMarkId,
            chatId: data.chatId,
            status: 'READ',
          });
        }
      } catch {
        return;
      }
    });

    socket.on('chat:join', async (data: { chatId: string }) => {
      try {
        await requireChatMembership(prisma, data.chatId, userId);
        socket.join(`chat:${data.chatId}`);
      } catch {
        socket.emit('error', { message: 'Нет доступа к чату' });
      }
    });

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
