# Telegram-подтверждение при регистрации

## Что есть сейчас
Сейчас `POST /auth/register` сразу создаёт пользователя в `User`, бронирует тег в `TagHistory`, создаёт `Session` и сразу выдаёт JWT-токены. Проверка владения номером телефона отсутствует.

## Цель
Заменить дорогое SMS-подтверждение на подтверждение через Telegram-бота:
1. пользователь начинает регистрацию по номеру телефона;
2. получает одноразовый deep-link на бота;
3. подтверждает действие в Telegram;
4. только после этого создаётся аккаунт и выдаются токены.

---

## Предлагаемый UX

### 1) Шаг «старт регистрации»
`POST /auth/register/start`

Вход:
```json
{
  "phone": "+79991234567",
  "tag": "@new_user",
  "name": "Alex",
  "password": "secret123",
  "bio": "optional"
}
```

Сервер:
- валидирует поля (как сейчас в `/register`);
- проверяет уникальность `phone`, `tag`, `tagHistory`;
- **не создаёт** `User`;
- создаёт черновик регистрации (pending);
- генерирует `verificationToken` (random 32+ bytes), хранит **hash** токена в БД;
- возвращает клиенту ссылку:
  `https://t.me/<BOT_USERNAME>?start=verify_<verificationToken>`

Ответ:
```json
{
  "ok": true,
  "data": {
    "registrationId": "...",
    "expiresAt": "2026-04-08T12:00:00.000Z",
    "telegramDeepLink": "https://t.me/..."
  }
}
```

### 2) Шаг «подтверждение в Telegram»
Пользователь открывает бота по deep-link и нажимает кнопку «Подтвердить регистрацию».

Бот вызывает backend endpoint:
`POST /internal/telegram/confirm`

Вход (только для бота, по внутреннему токену):
```json
{
  "token": "verificationToken",
  "telegramUser": {
    "id": 123456789,
    "username": "tg_user",
    "firstName": "Alex"
  }
}
```

Сервер:
- ищет pending-регистрацию по hash токена;
- проверяет TTL и статус;
- помечает как `CONFIRMED`, сохраняет telegramId/username;
- делает операцию идемпотентной (повторный confirm безопасен).

### 3) Шаг «финализация»
`POST /auth/register/complete`

Вход:
```json
{
  "registrationId": "..."
}
```

Сервер в транзакции:
- повторно проверяет, что `phone/tag` не заняты (за время ожидания мог появиться конфликт);
- создаёт `User`;
- создаёт `TagHistory`;
- создаёт `Session`;
- помечает pending как `COMPLETED`;
- отдаёт токены как текущий `/register`.

---

## Изменения в БД (Prisma)

Добавить модель `RegistrationAttempt`:

- `id: String @id @default(uuid())`
- `phone: String`
- `tag: String`
- `name: String`
- `bio: String?`
- `passwordHash: String`
- `verificationTokenHash: String @unique`
- `status: PENDING | CONFIRMED | COMPLETED | EXPIRED | CANCELED`
- `telegramId: String?`
- `telegramUsername: String?`
- `expiresAt: DateTime`
- `confirmedAt: DateTime?`
- `createdAt: DateTime @default(now())`

Индексы:
- `[phone, status]`
- `[tag, status]`
- `[expiresAt]`

Опционально в `User`:
- `telegramId String? @unique`
- `telegramUsername String?`

---

## Безопасность

1. **Хранить только hash verification-token** (как с паролями/refresh-token).
2. TTL для pending (например, 10–15 минут).
3. Ограничения rate-limit:
   - `/auth/register/start` — строго;
   - `/internal/telegram/confirm` — whitelist только для бота + секретный header.
4. Защитить внутренний endpoint:
   - `X-Telegram-Internal-Token` (env secret),
   - проверка IP (если инфраструктура позволяет),
   - журналирование и аудит.
5. Idempotency:
   - повторный `confirm` и `complete` не должен ломать состояние.

---

## Бот: минимальная реализация

Отдельный сервис `zavodgram-telegram-bot` (Node.js + Telegraf):

Команды:
- `/start`
- `/start verify_<token>` → показать кнопку «Подтвердить».

При нажатии кнопки:
- отправить `POST /internal/telegram/confirm`;
- ответить пользователю «Подтверждено, вернитесь в приложение».

Боту не нужен доступ к БД — только к backend internal API.

---

## План внедрения (по итерациям)

### Итерация 1 (MVP)
- Добавить `RegistrationAttempt` и новые auth endpoints.
- Реализовать бота с confirm.
- На фронте заменить один шаг регистрации на 2 шага (`start -> complete`).

### Итерация 2
- Добавить фоновую очистку истёкших pending.
- Добавить метрики (conversion воронки start/confirm/complete).

### Итерация 3
- Привязка Telegram к существующему аккаунту (security events, recovery).

---

## Что поменять в текущем коде

1. Вынести логику текущего `POST /auth/register` в сервис `completeRegistration()`.
2. Добавить маршруты:
   - `POST /auth/register/start`
   - `POST /auth/register/complete`
   - `POST /internal/telegram/confirm`
3. Добавить Prisma migration + enum статусов.
4. Добавить env:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_BOT_USERNAME`
   - `TELEGRAM_INTERNAL_TOKEN`
5. Во фронте `AuthPage` добавить шаг «Подтвердите в Telegram» + polling статуса.

---

## Риски и как закрыть

- **Пользователь не имеет Telegram**: оставить fallback-флоу (например, invite-код админа или SMS только для edge-case).
- **Deep-link утёк**: короткий TTL + одноразовость + hash токена.
- **Гонки при завершении регистрации**: транзакция + уникальные индексы + повторная валидация.


## Автозеркало постов из публичного Telegram-канала

Добавлена фоновая задача в backend, которая периодически:
1. читает публичную страницу `https://t.me/s/<sourceSlug>`;
2. забирает новые посты (текст + изображения/видео, если доступны публичные ссылки);
3. публикует их в канал ZavodGram с указанным `channelSlug`;
4. хранит прогресс (`lastImportedPostId`) в таблице `TelegramChannelMirrorState`.

### Переменные окружения
- `TELEGRAM_CHANNEL_MIRROR_ENABLED=true` — включить импорт;
- `TELEGRAM_CHANNEL_MIRROR_SOURCE_SLUG=dvachannel` — источник в Telegram;
- `TELEGRAM_CHANNEL_MIRROR_TARGET_SLUG=<slug_вашего_канала_в_ZavodGram>` — куда публиковать;
- `TELEGRAM_CHANNEL_MIRROR_POLL_INTERVAL_SEC=120` — интервал опроса;
- `TELEGRAM_CHANNEL_MIRROR_BATCH_SIZE=10` — максимум постов за один цикл.

> Важно: медиа импортируются best-effort (из публичных URL Telegram). Комментарии пока не переносятся.


### Управление несколькими источниками
Теперь mirror поддерживает несколько правил одновременно через админку:
- `GET /api/admin/telegram-mirrors` — список правил;
- `POST /api/admin/telegram-mirrors` — добавить правило `sourceSlug -> targetChatId`;
- `PATCH /api/admin/telegram-mirrors/:id` — включить/выключить или изменить правило;
- `DELETE /api/admin/telegram-mirrors/:id` — удалить правило.

Фоновый воркер проходит по всем включённым правилам (`enabled=true`) и синхронизирует каждое независимо.
