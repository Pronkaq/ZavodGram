import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

export const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'event', level: 'error' },
  ],
});

prisma.$on('error', (e) => {
  logger.error('Prisma error', { message: e.message });
});

export async function connectDB() {
  try {
    await prisma.$connect();
    logger.info('✓ PostgreSQL connected');
  } catch (error) {
    logger.error('✗ PostgreSQL connection failed', { error });
    process.exit(1);
  }
}

export async function disconnectDB() {
  await prisma.$disconnect();
  logger.info('PostgreSQL disconnected');
}
