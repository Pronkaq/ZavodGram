# ABOUT: ZavodGram

## Что это за проект
**ZavodGram** — self-hosted мессенджер в стиле Telegram с веб-клиентом, backend API + WebSocket, PostgreSQL/Redis и отдельным Telegram-ботом для подтверждения регистрации. Проект организован как монорепозиторий из нескольких сервисов и инфраструктурных конфигов.

---

## Состав репозитория

- `zavodgram-web` — фронтенд на React + Vite.
- `zavodgram-backend` — backend на Node.js/TypeScript (Express + Socket.IO + Prisma).
- `zavodgram-telegram-bot` — Telegram-бот на Telegraf для подтверждения регистрации.
- `docker-compose.yml` — orchestration локального/серверного запуска всех сервисов.
- `nginx/` — готовые конфиги reverse proxy и виртуальных хостов.
- `docs/` — инженерные заметки, миграции и эксплуатационные документы.

---

## Технологический стек

### Frontend (`zavodgram-web`)
- **React 18**
- **Vite 5**
- **socket.io-client** для realtime
- **react-virtuoso** для эффективного рендера длинных списков сообщений

### Backend (`zavodgram-backend`)
- **Node.js + TypeScript**
- **Express** (REST API)
- **Socket.IO** (realtime чат-события)
- **Prisma ORM**
- **PostgreSQL** (основные данные)
- **Redis** (кэш/оперативные состояния)
- **JWT auth** (access + refresh)
- **Zod** (валидация)
- **Multer + Sharp** (медиа upload/обработка)
- **Winston** (логирование)

### Telegram-бот (`zavodgram-telegram-bot`)
- **Telegraf**
- Deep-link подтверждение регистрации через `verify_<token>`

### Инфраструктура
- **Docker / Docker Compose**
- **Nginx** (конфиги в репозитории)

---

## Ключевые возможности

### 1) Аутентификация и регистрация
- Регистрация и логин по телефону/паролю.
- Refresh-токены и сессии для multi-device.
- Поддержка Telegram-подтверждения регистрации:
  - старт регистрации,
  - подтверждение токена через бота,
  - финализация создания аккаунта.

### 2) Работа с пользователями
- Профиль текущего пользователя.
- Обновление профиля.
- Поиск пользователей.
- Теги (`@username`) с историей/резервированием.

### 3) Чаты и сообщения
- Типы чатов: private / group / channel / secret.
- Создание чатов, управление участниками и ролями.
- Отправка, редактирование, удаление сообщений (soft-delete).
- Reply/forward, реакции, топики в группах/каналах.
- Настройки комментариев и модерации.

### 4) Медиа и голосовые
- Загрузка файлов и мультизагрузка.
- Поддержка изображений/видео/аудио.
- Голосовые сообщения в веб-клиенте.
- Опциональная расшифровка аудио через OpenAI-совместимый endpoint (настраивается env-переменными backend).

### 5) Уведомления и realtime
- Realtime-доставка через Socket.IO.
- Индикаторы активности/набора.
- REST-эндпоинты уведомлений.

### 6) Админ-инструменты и Telegram mirror
- Админские маршруты backend.
- Фоновое автозеркало публичных Telegram-каналов в каналы ZavodGram.
- Поддержка нескольких правил mirror (`sourceSlug -> targetChatId`) с отдельным состоянием синхронизации.

---

## Архитектура взаимодействия сервисов

1. Пользователь открывает `zavodgram-web`.
2. Frontend работает с REST API backend (`/api/*`) и WebSocket (`/socket.io/*`).
3. Backend хранит постоянные данные в PostgreSQL.
4. Redis используется для оперативного состояния и realtime-механик.
5. Telegram-бот обращается во внутренние backend endpoint’ы для подтверждения регистраций.

---

## База данных (Prisma)

Основные сущности:
- `User`, `Session`, `TagHistory`
- `RegistrationAttempt` (Telegram verification flow)
- `Chat`, `ChatMember`, `ChatBan`, `ChatTopic`
- `Message`, `MessageReaction`
- `MediaFile`, `Notification`
- `TelegramChannelMirrorState`

Схема ориентирована на:
- многопользовательские чаты,
- роли и модерацию,
- историю/статусы сообщений,
- расширение под фичи уровня Telegram (темы, реакции, защищенный контент, интеграции).

---

## Запуск и окружение

### Локально через Docker Compose
В корневом `docker-compose.yml` поднимаются:
- `postgres` (16-alpine)
- `redis` (7-alpine)
- `backend` (порт `4000`)
- `telegram-bot`
- `frontend` (порт `3081`)

### Базовые переменные окружения
- `DB_PASSWORD`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `CORS_ORIGIN`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `TELEGRAM_INTERNAL_TOKEN`
- mirror-переменные (`TELEGRAM_CHANNEL_MIRROR_*`)
- опционально transcribe-переменные (`OPENAI_API_KEY`, `OPENAI_TRANSCRIPTION_MODEL`, ...)

Пример части env есть в `example.env`.

---

## Frontend-структура (кратко)

- Точка входа: `src/main.jsx`
- Контексты: `AuthContext`, `ChatContext`
- Основной экран: `ChatApp`
- Страницы: `AuthPage`, `AdminPage`
- Большой набор UI/хуков для:
  - чатов,
  - каналов,
  - инвайтов,
  - реакций,
  - голосовых,
  - медиа-модалок,
  - уведомлений и настроек.

---

## Backend-структура (кратко)

- `src/server.ts` — bootstrap Express + Socket.IO + маршруты.
- `src/config` — env-конфиг.
- `src/core` — db/redis/logger/security/errors.
- `src/middleware` — auth/error handling.
- `src/modules/*` — auth/users/chats/messages/media/notifications/admin.
- `src/ws/socket.ts` — realtime обработчики.
- `prisma/` — схема, миграции, seed.

---

## Текущее позиционирование проекта

ZavodGram — это полнофункциональная база для корпоративного/командного мессенджера с Telegram-подобным UX, которую можно:
- запускать on-prem/self-hosted,
- дорабатывать под свои процессы,
- масштабировать как по backend (Redis + Socket.IO), так и по данным (PostgreSQL + миграции Prisma).

Проект уже содержит как продуктовые функции (чат, медиа, админка), так и инженерные заделы для дальнейшего роста (интеграции, mirror-воркеры, модульная структура, docs по эксплуатации).
