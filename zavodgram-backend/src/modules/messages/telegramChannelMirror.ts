import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { MediaType, Prisma } from '@prisma/client';
import { prisma } from '../../core/database';
import { logger } from '../../core/logger';
import { config } from '../../config';

type ParsedMedia = {
  type: MediaType;
  remoteUrl: string;
};

type ParsedPost = {
  postId: number;
  text: string;
  url: string;
  media: ParsedMedia[];
};

type PreparedMedia = {
  type: MediaType;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
};

const ALLOWED_MEDIA_TYPES = new Set<MediaType>(['IMAGE', 'VIDEO']);


const mirrorRepo = (prisma as any).telegramChannelMirrorState as {
  upsert: Function;
  findMany: Function;
  update: Function;
} | undefined;

function mirrorCfg() {
  return {
    enabled: (process.env.TELEGRAM_CHANNEL_MIRROR_ENABLED || 'false').toLowerCase() === 'true',
    sourceSlug: process.env.TELEGRAM_CHANNEL_MIRROR_SOURCE_SLUG || 'dvachannel',
    targetSlug: process.env.TELEGRAM_CHANNEL_MIRROR_TARGET_SLUG || '',
    pollIntervalSec: Number.parseInt(process.env.TELEGRAM_CHANNEL_MIRROR_POLL_INTERVAL_SEC || '120', 10),
    batchSize: Number.parseInt(process.env.TELEGRAM_CHANNEL_MIRROR_BATCH_SIZE || '10', 10),
  };
}

function decodeHtml(input: string) {
  return input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function decodeUrl(input: string) {
  return input.replace(/&amp;/g, '&').trim();
}

function extractPostBlocks(html: string) {
  const marker = /data-post="([a-zA-Z0-9_]+)\/(\d+)"/g;
  const hits = Array.from(html.matchAll(marker));
  if (hits.length === 0) return [] as Array<{ slug: string; postId: number; block: string }>;

  return hits
    .map((hit, idx) => {
      const start = hit.index ?? 0;
      const end = idx + 1 < hits.length ? (hits[idx + 1].index ?? html.length) : html.length;
      return {
        slug: hit[1],
        postId: Number.parseInt(hit[2], 10),
        block: html.slice(start, end),
      };
    })
    .filter((item) => Number.isFinite(item.postId));
}

function parseMedia(block: string): ParsedMedia[] {
  const media: ParsedMedia[] = [];
  const seen = new Set<string>();

  const photoRegex = /tgme_widget_message_photo_wrap[^>]*style="[^"]*url\(['"]?([^'")]+)['"]?\)/g;
  for (const match of block.matchAll(photoRegex)) {
    const remoteUrl = decodeUrl(match[1] || '');
    if (!remoteUrl || seen.has(remoteUrl)) continue;
    seen.add(remoteUrl);
    media.push({ type: 'IMAGE', remoteUrl });
  }

  const videoRegex = /<video[^>]+src="([^"]+)"/g;
  for (const match of block.matchAll(videoRegex)) {
    const remoteUrl = decodeUrl(match[1] || '');
    if (!remoteUrl || seen.has(remoteUrl)) continue;
    seen.add(remoteUrl);
    media.push({ type: 'VIDEO', remoteUrl });
  }

  return media.filter((item) => ALLOWED_MEDIA_TYPES.has(item.type));
}

function parseTelegramChannelPage(html: string, sourceSlug: string): ParsedPost[] {
  const posts: ParsedPost[] = [];

  for (const item of extractPostBlocks(html)) {
    if (item.slug.toLowerCase() !== sourceSlug.toLowerCase()) continue;

    const textMatch = item.block.match(/<div class="tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/);
    const text = decodeHtml(textMatch?.[1] || '');
    const media = parseMedia(item.block);

    if (!text && media.length === 0) continue;

    posts.push({
      postId: item.postId,
      text,
      media,
      url: `https://t.me/${sourceSlug}/${item.postId}`,
    });
  }

  posts.sort((a, b) => a.postId - b.postId);
  return posts;
}

function guessMimeFromUrl(url: string, fallbackType: MediaType) {
  const lower = url.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.webm')) return 'video/webm';
  return fallbackType === 'VIDEO' ? 'video/mp4' : 'image/jpeg';
}

function extensionByMime(mimeType: string, mediaType: MediaType) {
  if (mimeType.includes('jpeg')) return '.jpg';
  if (mimeType.includes('png')) return '.png';
  if (mimeType.includes('webp')) return '.webp';
  if (mimeType.includes('gif')) return '.gif';
  if (mimeType.includes('webm')) return '.webm';
  if (mimeType.includes('mp4')) return '.mp4';
  return mediaType === 'VIDEO' ? '.mp4' : '.jpg';
}

async function downloadRemoteMedia(item: ParsedMedia): Promise<PreparedMedia | null> {
  try {
    const response = await fetch(item.remoteUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ZavodGramMirror/1.0)' },
    });
    if (!response.ok) return null;

    const arrayBuffer = await response.arrayBuffer();
    const size = arrayBuffer.byteLength;
    if (size <= 0 || size > config.upload.maxFileSize) {
      return null;
    }

    const mimeType = (response.headers.get('content-type') || '').split(';')[0] || guessMimeFromUrl(item.remoteUrl, item.type);
    const dateDir = new Date().toISOString().slice(0, 10);
    const mediaFolder = item.type === 'VIDEO' ? 'video' : 'image';
    const ext = extensionByMime(mimeType, item.type);
    const filename = `${randomUUID()}${ext}`;
    const dir = path.join(config.upload.dir, mediaFolder, dateDir);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, filename), Buffer.from(arrayBuffer));

    return {
      type: item.type,
      filename,
      originalName: `telegram_${mediaFolder}_${filename}`,
      mimeType,
      size,
      url: `/internal/${mediaFolder}/${dateDir}/${filename}`,
    };
  } catch {
    return null;
  }
}

let syncLock = false;

async function importPostWithMedia(params: { targetChatId: string; authorId: string; post: ParsedPost }) {
  const { targetChatId, authorId, post } = params;
  const preparedMedia = await Promise.all(post.media.map((item) => downloadRemoteMedia(item)));
  const mediaToCreate = preparedMedia.filter((item): item is PreparedMedia => Boolean(item));

  const text = post.text ? `${post.text}

Источник: ${post.url}` : `Источник: ${post.url}`;

  await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: {
        chatId: targetChatId,
        fromId: authorId,
        text,
      },
    });

    if (mediaToCreate.length > 0) {
      await tx.mediaFile.createMany({
        data: mediaToCreate.map((item) => ({
          messageId: created.id,
          uploaderId: authorId,
          type: item.type,
          filename: item.filename,
          originalName: item.originalName,
          mimeType: item.mimeType,
          size: item.size,
          url: item.url,
          thumbnail: null,
          width: null,
          height: null,
          duration: null,
        })),
      });
    }
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  });
}

async function ensureEnvMirrorState() {
  const cfg = mirrorCfg();
  if (!cfg.enabled || !cfg.targetSlug) return;

  const targetChannel = await prisma.chat.findFirst({
    where: { type: 'CHANNEL', channelSlug: cfg.targetSlug },
    select: { id: true },
  });
  if (!targetChannel) return;

  if (!mirrorRepo) return;

  await mirrorRepo.upsert({
    where: {
      sourceSlug_targetChatId: {
        sourceSlug: cfg.sourceSlug,
        targetChatId: targetChannel.id,
      },
    },
    create: {
      sourceSlug: cfg.sourceSlug,
      targetChatId: targetChannel.id,
      enabled: true,
    },
    update: {},
  });
}

async function syncMirrorState(state: { id: string; sourceSlug: string; targetChatId: string; lastImportedPostId: number }) {
  const targetChannel = await prisma.chat.findUnique({
    where: { id: state.targetChatId },
    select: { id: true, createdBy: true, channelSlug: true },
  });
  if (!targetChannel) {
    logger.warn('Telegram mirror: target channel missing', { targetChatId: state.targetChatId, stateId: state.id });
    return;
  }

  const owner = await prisma.chatMember.findFirst({
    where: { chatId: targetChannel.id, role: 'OWNER' },
    select: { userId: true },
  });
  const authorId = targetChannel.createdBy || owner?.userId;

  if (!authorId) {
    logger.warn('Telegram mirror: no author found for channel', { targetChatId: targetChannel.id, stateId: state.id });
    return;
  }

  const response = await fetch(`https://t.me/s/${state.sourceSlug}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ZavodGramMirror/1.0)' },
  });

  if (!response.ok) {
    throw new Error(`telegram responded with status ${response.status}`);
  }

  const html = await response.text();
  const parsedPosts = parseTelegramChannelPage(html, state.sourceSlug)
    .filter((post) => post.postId > state.lastImportedPostId)
    .slice(0, Math.max(1, mirrorCfg().batchSize));

  if (parsedPosts.length === 0) {
    if (mirrorRepo) await mirrorRepo.update({ where: { id: state.id }, data: { lastSyncAt: new Date() } });
    return;
  }

  let lastImported = state.lastImportedPostId;
  for (const post of parsedPosts) {
    await importPostWithMedia({ targetChatId: targetChannel.id, authorId, post });
    lastImported = post.postId;
  }

  await prisma.$transaction([
    mirrorRepo!.update({
      where: { id: state.id },
      data: { lastImportedPostId: lastImported, lastSyncAt: new Date() },
    }),
    prisma.chat.update({ where: { id: targetChannel.id }, data: { updatedAt: new Date() } }),
  ]);

  logger.info('Telegram mirror: imported posts', {
    sourceSlug: state.sourceSlug,
    targetChatId: targetChannel.id,
    targetSlug: targetChannel.channelSlug,
    count: parsedPosts.length,
    lastImported,
  });
}

async function runMirrorOnce() {
  if (syncLock) return;
  syncLock = true;

  try {
    await ensureEnvMirrorState();

    if (!mirrorRepo) {
      logger.warn('Telegram mirror skipped: Prisma model TelegramChannelMirrorState is unavailable');
      return;
    }

    const activeMirrors = await mirrorRepo.findMany({
      where: { enabled: true },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });

    if (activeMirrors.length === 0) {
      if (!mirrorCfg().enabled) logger.info('Telegram mirror disabled');
      return;
    }

    for (const state of activeMirrors) {
      try {
        await syncMirrorState(state);
      } catch (error) {
        logger.error('Telegram mirror failed for state', { error, stateId: state.id, sourceSlug: state.sourceSlug, targetChatId: state.targetChatId });
      }
    }
  } finally {
    syncLock = false;
  }
}

export function startTelegramChannelMirror() {
  runMirrorOnce();

  const cfg = mirrorCfg();
  const intervalMs = Math.max(30, cfg.pollIntervalSec) * 1000;
  setInterval(runMirrorOnce, intervalMs);
  logger.info('Telegram mirror scheduler started', {
    envBootstrapEnabled: cfg.enabled,
    bootstrapSourceSlug: cfg.sourceSlug,
    bootstrapTargetSlug: cfg.targetSlug,
    intervalSec: Math.max(30, cfg.pollIntervalSec),
  });
}
