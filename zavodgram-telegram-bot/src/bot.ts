import { Telegraf, Markup } from 'telegraf';

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const backendBaseUrl = process.env.BACKEND_BASE_URL || 'http://localhost:4000/api/auth';
const internalToken = process.env.TELEGRAM_INTERNAL_TOKEN;

if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN is required');
if (!internalToken) throw new Error('TELEGRAM_INTERNAL_TOKEN is required');

const bot = new Telegraf(botToken);
const pendingConfirmations = new Map<number, string>();

function extractToken(startPayload?: string) {
  if (!startPayload) return null;

  const normalizedPayload = startPayload.trim();
  if (!normalizedPayload.startsWith('verify_')) return null;

  const token = normalizedPayload.slice('verify_'.length).trim();
  return token || null;
}

function resolveStartPayload(ctx: any) {
  // Deep-link payload can arrive either in ctx.startPayload (Telegraf >=4)
  // or as part of the /start command text in some clients.
  const directPayload = (ctx as any).startPayload || (ctx as any).payload;
  if (typeof directPayload === 'string' && directPayload.trim()) {
    return directPayload.trim();
  }

  const messageText = (ctx.message && 'text' in ctx.message)
    ? ctx.message.text
    : undefined;
  if (!messageText) return undefined;

  const [, rawPayload] = messageText.split(/\s+/, 2);
  return rawPayload?.trim();
}

bot.start(async (ctx) => {
  const token = extractToken(resolveStartPayload(ctx));

  if (!token) {
    await ctx.reply('Привет! Для подтверждения регистрации откройте ссылку из приложения ZavodGram.');
    return;
  }

  pendingConfirmations.set(ctx.from.id, token);

  await ctx.reply(
    'Нажмите кнопку ниже, чтобы подтвердить регистрацию в ZavodGram.',
    Markup.inlineKeyboard([
      Markup.button.callback('✅ Подтвердить регистрацию', 'confirm_registration'),
    ]),
  );
});

bot.action('confirm_registration', async (ctx) => {
  const token = pendingConfirmations.get(ctx.from.id);

  if (!token) {
    await ctx.answerCbQuery('Ссылка устарела');
    await ctx.reply('Токен не найден. Вернитесь в приложение и получите новую ссылку.');
    return;
  }

  try {
    const res = await fetch(`${backendBaseUrl}/internal/telegram/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-internal-token': internalToken,
      },
      body: JSON.stringify({
        token,
        telegramUser: {
          id: ctx.from.id,
          username: ctx.from.username,
          firstName: ctx.from.first_name,
        },
      }),
    });

    if (!res.ok) {
      await ctx.answerCbQuery('Не удалось подтвердить');
      await ctx.reply('Не удалось подтвердить регистрацию. Попробуйте снова в приложении.');
      return;
    }

    pendingConfirmations.delete(ctx.from.id);
    await ctx.answerCbQuery('Подтверждено');
    await ctx.reply('Готово ✅ Вернитесь в приложение и нажмите «Завершить регистрацию».');
  } catch {
    await ctx.answerCbQuery('Ошибка сети');
    await ctx.reply('Ошибка сети. Попробуйте позже.');
  }
});

async function startBot() {
  try {
    await bot.telegram.deleteWebhook({ drop_pending_updates: false });
    await bot.launch();
    console.log('[telegram-bot] bot started in polling mode');
  } catch (error) {
    console.error('[telegram-bot] failed to start', error);
    process.exit(1);
  }
}

void startBot();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
