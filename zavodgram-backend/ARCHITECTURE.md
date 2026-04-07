# ZavodGram — Архитектура Backend

## Стек

| Компонент       | Технология                          |
|-----------------|-------------------------------------|
| Runtime         | Node.js 20 + TypeScript             |
| HTTP Framework  | Express.js                          |
| Real-time       | Socket.IO (WebSocket)               |
| Database        | PostgreSQL 16                       |
| ORM             | Prisma                              |
| Cache/Pub-Sub   | Redis 7                             |
| Auth            | JWT (access + refresh, ротация)     |
| Validation      | Zod                                 |
| File storage    | Локальный диск + thumbnails (Sharp) |
| Logging         | Winston                             |
| Deploy          | Docker Compose                      |

---

## Архитектура

```
                    ┌──────────────┐
                    │   Nginx/     │
                    │   Caddy      │ :80/:443
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │                         │
     ┌────────▼────────┐    ┌──────────▼──────────┐
     │   Frontend       │    │   Backend API        │
     │   Vite + React   │    │   Express + Socket.IO│
     │   :80            │    │   :4000              │
     └──────────────────┘    └──────┬───────────────┘
                                    │
                       ┌────────────┼────────────┐
                       │                         │
              ┌────────▼────────┐    ┌──────────▼──────┐
              │   PostgreSQL    │    │   Redis          │
              │   :5432         │    │   :6379          │
              │                 │    │                  │
              │  Users          │    │  Online status   │
              │  Chats          │    │  Sessions cache  │
              │  Messages       │    │  Typing status   │
              │  Media          │    │  Rate limiting   │
              │  Notifications  │    │  Pub/Sub (scale) │
              │  Sessions       │    │                  │
              │  Tag history    │    │                  │
              └─────────────────┘    └──────────────────┘
```

---

## API Endpoints

### Auth
```
POST   /api/auth/register    — Регистрация (phone, tag, name, password)
POST   /api/auth/login       — Вход (phone, password)
POST   /api/auth/refresh     — Обновление токенов
POST   /api/auth/logout      — Выход
```

### Users
```
GET    /api/users/me          — Мой профиль
PATCH  /api/users/me          — Обновить профиль
PUT    /api/users/me/tag      — Сменить тег (с бронированием)
GET    /api/users/search?q=   — Поиск пользователей
GET    /api/users/:id         — Профиль по ID
GET    /api/users/tag/:tag    — Профиль по @тегу
```

### Chats
```
POST   /api/chats                     — Создать чат/группу/канал/секретный
GET    /api/chats                     — Список моих чатов
GET    /api/chats/:id                 — Информация о чате
POST   /api/chats/:id/members         — Добавить участника
DELETE /api/chats/:id/members/:userId  — Удалить участника
PATCH  /api/chats/:id/mute            — Мьют/анмьют
```

### Messages
```
GET    /api/chats/:chatId/messages         — Сообщения (cursor pagination)
POST   /api/chats/:chatId/messages         — Отправить (text, replyToId, forwardedFromId)
PATCH  /api/chats/:chatId/messages/:id     — Редактировать
DELETE /api/chats/:chatId/messages/:id     — Удалить (soft delete)
GET    /api/chats/:chatId/messages/search  — Поиск по сообщениям
```

### Media
```
POST   /api/media/upload            — Загрузить файл
POST   /api/media/upload-multiple   — Загрузить несколько
```

### Notifications
```
GET    /api/notifications     — Список уведомлений
POST   /api/notifications/read — Отметить прочитанными
DELETE /api/notifications      — Очистить все
```

---

## WebSocket Events

### Client → Server
```
message:send    { chatId, text, replyToId?, forwardedFromId?, encrypted? }
message:edit    { messageId, chatId, text }
message:delete  { messageId, chatId }
message:read    { chatId, messageId }
typing:start    { chatId }
chat:join       { chatId }
```

### Server → Client
```
message:new      — Новое сообщение
message:sent     — Подтверждение отправки
message:edited   — Сообщение отредактировано
message:deleted  — Сообщение удалено
message:status   — Статус прочтения
user:typing      — Индикатор набора
user:status      — Онлайн/оффлайн
notification     — Push-уведомление
error            — Ошибка
```

---

## Масштабирование

### Горизонтальное (несколько инстансов backend):
- **Redis Pub/Sub** уже интегрирован — все WebSocket-события проходят через Redis
- Добавь `socket.io-redis` адаптер для multi-node Socket.IO
- Nginx upstream балансировка с `ip_hash` для sticky sessions

### Вертикальное:
- PostgreSQL: read replicas, connection pooling (PgBouncer)
- Redis: Redis Cluster для >16GB данных
- Media: вынести в S3/MinIO

### Очередь задач (когда нужно):
- BullMQ + Redis для: отложенных уведомлений, обработки видео, очистки старых сессий

---

## Деплой на VPS

### Быстрый старт:
```bash
# 1. Клонируй оба проекта в одну папку
/home/user/zavodgram/
├── zavodgram-web/       # Frontend
├── zavodgram-backend/   # Backend
└── docker-compose.full.yml

# 2. Копируй docker-compose в корень
cp zavodgram-backend/docker-compose.full.yml ./docker-compose.yml

# 3. Создай .env
cat > .env << EOF
DB_PASSWORD=your_strong_db_password
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
CORS_ORIGIN=https://zavodgram.ru
EOF

# 4. Запускай
docker-compose up -d --build

# 5. Прогони миграции и сид
docker exec zavodgram-api npx prisma migrate deploy
docker exec zavodgram-api npx tsx prisma/seed.ts
```

### С доменом (Caddy):
```
zavodgram.ru {
    # Frontend
    handle / {
        reverse_proxy frontend:80
    }

    # API
    handle /api/* {
        reverse_proxy backend:4000
    }

    # WebSocket
    handle /socket.io/* {
        reverse_proxy backend:4000
    }

    # Uploads
    handle /uploads/* {
        reverse_proxy backend:4000
    }
}
```

---

## Структура проекта

```
zavodgram-backend/
├── src/
│   ├── server.ts                 # Entry point
│   ├── config/
│   │   └── index.ts              # Environment config
│   ├── core/
│   │   ├── database.ts           # Prisma client
│   │   ├── redis.ts              # Redis + helpers
│   │   ├── logger.ts             # Winston logger
│   │   └── errors.ts             # Custom errors
│   ├── middleware/
│   │   ├── auth.ts               # JWT auth middleware
│   │   └── errorHandler.ts       # Error handler + rate limiter
│   ├── modules/
│   │   ├── auth/
│   │   │   └── auth.routes.ts    # Register, login, refresh
│   │   ├── users/
│   │   │   └── users.routes.ts   # Profile, tags, search
│   │   ├── chats/
│   │   │   └── chats.routes.ts   # CRUD чатов, участники
│   │   ├── messages/
│   │   │   └── messages.routes.ts # CRUD, reply, forward, search
│   │   ├── media/
│   │   │   └── media.routes.ts   # Upload, thumbnails
│   │   └── notifications/
│   │       └── notifications.routes.ts
│   └── ws/
│       └── socket.ts             # WebSocket handler
├── prisma/
│   ├── schema.prisma             # Data model
│   └── seed.ts                   # Test data
├── docker-compose.full.yml       # Full stack
├── Dockerfile
├── .env.example
├── package.json
└── tsconfig.json
```

## Безопасность

- **Пароли**: bcrypt с salt rounds = 12
- **JWT**: короткоживущий access (15мин) + long-lived refresh (30дн) с ротацией
- **Rate limiting**: Redis-based, per-IP + per-route
- **Helmet**: HTTP security headers
- **CORS**: whitelist origins
- **Soft delete**: сообщения не удаляются физически
- **Tag reservation**: теги бронируются навсегда в таблице TagHistory
- **Secret chats**: флаг encrypted, готово для интеграции Signal Protocol
