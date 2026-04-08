# ZavodGram Telegram Bot

Минимальный бот для подтверждения регистрации через Telegram.

## Env

- `TELEGRAM_BOT_TOKEN` — токен бота.
- `TELEGRAM_INTERNAL_TOKEN` — секрет для вызова backend endpoint.
- `BACKEND_BASE_URL` — базовый URL backend auth API (по умолчанию `http://localhost:4000/api/auth`).

## Run

```bash
npm install
npm run dev
```

Бот ожидает deep-link payload вида `verify_<token>`.
