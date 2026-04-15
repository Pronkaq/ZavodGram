import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';

import { config } from './config';
import { logger } from './core/logger';
import { connectDB, disconnectDB, prisma } from './core/database';
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

const DB_RETRY_DELAY_MS = 5000;

let dbReady = false;

async function connectDbWithRetry() {
  while (!dbReady) {
    try {
      await connectDB();
      dbReady = true;
      logger.info('✓ Database connected and ready');
      return;
    } catch (err) {
      logger.error('Database is unavailable, retrying', {
        error: err instanceof Error ? err.message : String(err),
        retryInMs: DB_RETRY_DELAY_MS,
      });
      await new Promise((resolve) => setTimeout(resolve, DB_RETRY_DELAY_MS));
    }
  }
}

async function bootstrap() {
  const app = express();
  const httpServer = createServer(app);
  app.set('trust proxy', 1);

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

  app.get('/ready', async (_req, res) => {
    try {
      if (!dbReady) throw new Error('DB not ready');
      await Promise.all([
        prismaHealthcheck(),
        redis.ping(),
      ]);
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  app.use('/api', (req, res, next) => {
    if (dbReady) {
      next();
      return;
    }

    if (req.path === '/auth/captcha') {
      next();
      return;
    }

    res.status(503).json({
      ok: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Сервис временно недоступен, попробуйте еще раз',
      },
    });
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

  void connectDbWithRetry();

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

async function prismaHealthcheck() {
  await prisma.$queryRaw`SELECT 1`;
}

bootstrap().catch((err) => {
  logger.error('Failed to start server', { error: err });
  process.exit(1);
});
