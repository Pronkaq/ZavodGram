import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';

import { config } from './config';
import { logger } from './core/logger';
import { connectDB, disconnectDB } from './core/database';
import { redis } from './core/redis';
import { errorHandler } from './middleware/errorHandler';
import { setupWebSocket } from './ws/socket';

// Routes
import authRoutes from './modules/auth/auth.routes';
import usersRoutes from './modules/users/users.routes';
import chatsRoutes from './modules/chats/chats.routes';
import messagesRoutes from './modules/messages/messages.routes';
import mediaRoutes from './modules/media/media.routes';
import notificationsRoutes from './modules/notifications/notifications.routes';
import adminRoutes from './modules/admin/admin.routes';
import { startTelegramChannelMirror } from './modules/messages/telegramChannelMirror';

async function bootstrap() {
  const app = express();
  const httpServer = createServer(app);

  // ── Middleware ──
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'same-site' },
    contentSecurityPolicy: false,
    referrerPolicy: { policy: 'no-referrer' },
  }));
  app.use(cors({
    origin: config.corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));


  // ── Health check ──
  app.get('/health', (_req, res) => {
    res.json({ ok: true, version: '0.3.1', uptime: process.uptime() });
  });

  // ── API Routes ──
  app.use('/api/auth', authRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/chats', chatsRoutes);
  app.use('/api/chats', messagesRoutes);   // /api/chats/:chatId/messages
  app.use('/api/media', mediaRoutes);
  app.use('/api/notifications', notificationsRoutes);
  app.use('/api/admin', adminRoutes);

  // ── Error handler (must be last) ──
  app.use(errorHandler);

  // ── Database ──
  await connectDB();

  // ── WebSocket ──
  setupWebSocket(httpServer);

  startTelegramChannelMirror();

  // ── Start server ──
  httpServer.listen(config.port, () => {
    logger.info(`
╔══════════════════════════════════════╗
║         ZavodGram Backend            ║
║──────────────────────────────────────║
║  HTTP:  http://localhost:${config.port}        ║
║  WS:    ws://localhost:${config.port}          ║
║  Env:   ${config.nodeEnv.padEnd(27)}║
╚══════════════════════════════════════╝
    `);
  });

  // ── Graceful shutdown ──
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down...`);
    httpServer.close();
    await disconnectDB();
    await redis.quit();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error('Failed to start server', { error: err });
  process.exit(1);
});
