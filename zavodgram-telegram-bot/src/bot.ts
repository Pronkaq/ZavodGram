import { Telegraf, Markup } from 'telegraf';

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const backendBaseUrl = process.env.BACKEND_BASE_URL || 'http://localhost:4000/api/auth';
const internalToken = process.env.TELEGRAM_INTERNAL_TOKEN;

if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN is required');
if (!internalToken) throw new Error('TELEGRAM_INTERNAL_TOKEN is required');

const bot = new Telegraf(botToken);

function extractToken(startPayload?: string) {
  if (!startPayload?.startsWith('verify_')) return null;
  return startPayload.replace('verify_', '').trim();
}

bot.start(async (ctx) => {
  const token = extractToken(ctx.payload);

  if (!token) {
    await ctx.reply('Привет! Для подтверждения регистрации откройте ссылку из приложения ZavodGram.');
    return;
  }

  await ctx.reply(
    'Нажмите кнопку ниже, чтобы подтвердить регистрацию в ZavodGram.',
    Markup.inlineKeyboard([
      Markup.button.callback('✅ Подтвердить регистрацию', `confirm:${token}`),
    ]),
  );
});

bot.action(/^confirm:(.+)$/, async (ctx) => {
  const token = ctx.match[1];

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
