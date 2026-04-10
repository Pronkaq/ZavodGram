import { prisma } from '../../core/database';
import { logger } from '../../core/logger';
import { config } from '../../config';

type ParsedPost = {
  postId: number;
  text: string;
  url: string;
};

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

function parseTelegramChannelPage(html: string, sourceSlug: string): ParsedPost[] {
  const postRegex = /data-post="([a-zA-Z0-9_]+)\/(\d+)"[\s\S]*?<div class="tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/g;
  const posts: ParsedPost[] = [];

  for (const match of html.matchAll(postRegex)) {
    const slug = match[1];
    if (slug.toLowerCase() !== sourceSlug.toLowerCase()) continue;

    const postId = Number.parseInt(match[2], 10);
    if (!Number.isFinite(postId)) continue;

    const text = decodeHtml(match[3] || '');
    if (!text) continue;

    posts.push({
      postId,
      text,
      url: `https://t.me/${sourceSlug}/${postId}`,
    });
  }

  posts.sort((a, b) => a.postId - b.postId);
  return posts;
}

let syncLock = false;

async function runMirrorOnce() {
  if (!config.telegram.channelMirrorEnabled) return;
  if (!config.telegram.channelMirrorTargetSlug) return;
  if (syncLock) return;

  syncLock = true;
  try {
    const sourceSlug = config.telegram.channelMirrorSourceSlug;
    const targetChannel = await prisma.chat.findFirst({
      where: {
        type: 'CHANNEL',
        channelSlug: config.telegram.channelMirrorTargetSlug,
      },
      select: { id: true, createdBy: true },
    });

    if (!targetChannel) {
      logger.warn('Telegram mirror: target channel not found', { targetSlug: config.telegram.channelMirrorTargetSlug });
      return;
    }

    const owner = await prisma.chatMember.findFirst({
      where: { chatId: targetChannel.id, role: 'OWNER' },
      select: { userId: true },
    });
    const authorId = targetChannel.createdBy || owner?.userId;

    if (!authorId) {
      logger.warn('Telegram mirror: no author found for channel', { targetChatId: targetChannel.id });
      return;
    }

    const state = await prisma.telegramChannelMirrorState.upsert({
      where: { sourceSlug_targetChatId: { sourceSlug, targetChatId: targetChannel.id } },
      create: { sourceSlug, targetChatId: targetChannel.id },
      update: {},
    });

    if (!state.enabled) return;

    const response = await fetch(`https://t.me/s/${sourceSlug}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ZavodGramMirror/1.0)',
      },
    });

    if (!response.ok) {
      throw new Error(`telegram responded with status ${response.status}`);
    }

    const html = await response.text();
    const parsedPosts = parseTelegramChannelPage(html, sourceSlug)
      .filter((post) => post.postId > state.lastImportedPostId)
      .slice(0, Math.max(1, config.telegram.channelMirrorBatchSize));

    if (parsedPosts.length === 0) {
      await prisma.telegramChannelMirrorState.update({
        where: { id: state.id },
        data: { lastSyncAt: new Date() },
      });
      return;
    }

    let lastImported = state.lastImportedPostId;
    for (const post of parsedPosts) {
      const text = `${post.text}\n\nИсточник: ${post.url}`;
      await prisma.message.create({
        data: {
          chatId: targetChannel.id,
          fromId: authorId,
          text,
          commentsEnabled: true,
        },
      });
      lastImported = post.postId;
    }

    await prisma.$transaction([
      prisma.telegramChannelMirrorState.update({
        where: { id: state.id },
        data: {
          lastImportedPostId: lastImported,
          lastSyncAt: new Date(),
        },
      }),
      prisma.chat.update({
        where: { id: targetChannel.id },
        data: { updatedAt: new Date() },
      }),
    ]);

    logger.info('Telegram mirror: imported posts', {
      sourceSlug,
      targetChatId: targetChannel.id,
      count: parsedPosts.length,
      lastImported,
    });
  } catch (error) {
    logger.error('Telegram mirror failed', { error });
  } finally {
    syncLock = false;
  }
}

export function startTelegramChannelMirror() {
  if (!config.telegram.channelMirrorEnabled) {
    logger.info('Telegram mirror disabled');
    return;
  }

  if (!config.telegram.channelMirrorTargetSlug) {
    logger.warn('Telegram mirror enabled but TELEGRAM_CHANNEL_MIRROR_TARGET_SLUG is empty');
    return;
  }

  runMirrorOnce();

  const intervalMs = Math.max(30, config.telegram.channelMirrorPollIntervalSec) * 1000;
  setInterval(runMirrorOnce, intervalMs);
  logger.info('Telegram mirror started', {
    sourceSlug: config.telegram.channelMirrorSourceSlug,
    targetSlug: config.telegram.channelMirrorTargetSlug,
    intervalSec: Math.max(30, config.telegram.channelMirrorPollIntervalSec),
  });
}
