import Redis from 'ioredis';
import { config } from '../config';
import { logger } from './logger';

// Основной клиент — кэш, сессии, онлайн-статус
export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 200, 5000),
});

// Pub/Sub клиент — для масштабирования на несколько инстансов
export const redisPub = new Redis(config.redis.url);
export const redisSub = new Redis(config.redis.url);

redis.on('connect', () => logger.info('✓ Redis connected'));
redis.on('error', (err) => logger.error('✗ Redis error', { error: err.message }));

// ── Online status ──
export async function setUserOnline(userId: string): Promise<void> {
  await redis.set(`online:${userId}`, Date.now().toString(), 'EX', 300); // 5 min TTL
}

export async function setUserOffline(userId: string): Promise<void> {
  await redis.del(`online:${userId}`);
}

export async function isUserOnline(userId: string): Promise<boolean> {
  return (await redis.exists(`online:${userId}`)) === 1;
}

export async function getOnlineUsers(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const pipeline = redis.pipeline();
  userIds.forEach((id) => pipeline.exists(`online:${id}`));
  const results = await pipeline.exec();
  const online = new Set<string>();
  results?.forEach((r, i) => {
    if (r[1] === 1) online.add(userIds[i]);
  });
  return online;
}

// ── Typing indicator ──
export async function setTyping(chatId: string, userId: string): Promise<void> {
  await redis.set(`typing:${chatId}:${userId}`, '1', 'EX', 5);
}

// ── Rate limiting ──
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  const current = await redis.incr(`rl:${key}`);
  if (current === 1) await redis.expire(`rl:${key}`, windowSec);
  return current <= limit;
}

// ── Cache helpers ──
export async function cacheGet<T>(key: string): Promise<T | null> {
  const data = await redis.get(`cache:${key}`);
  return data ? JSON.parse(data) : null;
}

export async function cacheSet(key: string, data: unknown, ttlSec = 300): Promise<void> {
  await redis.set(`cache:${key}`, JSON.stringify(data), 'EX', ttlSec);
}

export async function cacheInvalidate(pattern: string): Promise<void> {
  const keys = await redis.keys(`cache:${pattern}`);
  if (keys.length > 0) await redis.del(...keys);
}
