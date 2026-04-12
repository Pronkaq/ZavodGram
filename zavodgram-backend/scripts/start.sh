#!/bin/sh
set -e

echo "[startup] checking prisma directory..."
ls -la /app/prisma || true

if [ -d /app/prisma/migrations ] && [ "$(ls -A /app/prisma/migrations 2>/dev/null)" ]; then
  echo "[startup] applying Prisma migrations (migrate deploy)..."

  deploy_log="$(mktemp)"
  run_deploy() {
    if npx prisma migrate deploy >"$deploy_log" 2>&1; then
      cat "$deploy_log"
      return 0
    fi

    cat "$deploy_log"
    return 1
  }

  bootstrap_legacy_schema() {
    echo "[startup] detected missing baseline Prisma tables, using prisma db push fallback..."
    npx prisma db push
    for migration_dir in /app/prisma/migrations/*; do
      [ -d "$migration_dir" ] || continue
      migration_name="$(basename "$migration_dir")"
      npx prisma migrate resolve --applied "$migration_name" >/dev/null 2>&1 || true
    done
  }

  if ! run_deploy; then
    failed_migration="$(sed -n 's/.*The `\([^`]*\)` migration started at .* failed/\1/p' "$deploy_log" | head -n1)"
    if grep -q "Error: P3009" "$deploy_log" && [ -n "$failed_migration" ]; then
      echo "[startup] detected failed migration: $failed_migration"
      echo "[startup] marking migration as rolled back and retrying deploy..."
      npx prisma migrate resolve --rolled-back "$failed_migration"
      if ! run_deploy; then
        if grep -q "Error: P3018" "$deploy_log" && grep -q 'relation "User" does not exist' "$deploy_log"; then
          bootstrap_legacy_schema
        else
          rm -f "$deploy_log"
          exit 1
        fi
      fi
    elif grep -q "Error: P3018" "$deploy_log" && grep -q 'relation "User" does not exist' "$deploy_log"; then
      bootstrap_legacy_schema
    else
      rm -f "$deploy_log"
      exit 1
    fi
  fi

  rm -f "$deploy_log"
else
  echo "[startup] no Prisma migrations found. Falling back to: prisma db push"
  npx prisma db push
fi

echo "[startup] starting API..."
node dist/server.js
