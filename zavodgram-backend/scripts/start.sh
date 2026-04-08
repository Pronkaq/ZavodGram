#!/bin/sh
set -e

echo "[startup] checking prisma directory..."
ls -la /app/prisma || true

if [ -d /app/prisma/migrations ] && [ "$(ls -A /app/prisma/migrations 2>/dev/null)" ]; then
  echo "[startup] applying Prisma migrations (migrate deploy)..."
  npx prisma migrate deploy
else
  echo "[startup] no Prisma migrations found. Falling back to: prisma db push"
  npx prisma db push
fi

echo "[startup] starting API..."
node dist/server.js
