# Автодеплой на VPS через GitHub Actions

После мержа в `main` workflow `.github/workflows/deploy-vps.yml` автоматически подключается к VPS по SSH, обновляет код и пересобирает контейнеры через `docker compose`.

## Что нужно настроить один раз

В GitHub репозитории откройте: `Settings` → `Secrets and variables` → `Actions` и добавьте секреты:

- `VPS_HOST` — IP или домен сервера.
- `VPS_USER` — пользователь для SSH.
- `VPS_SSH_KEY` — приватный SSH-ключ (лучше отдельный deploy key).
- `VPS_PORT` — SSH-порт (обычно `22`).
- `VPS_PROJECT_PATH` — абсолютный путь до папки проекта на сервере (например `/opt/ZavodGram`).

## Что делает workflow

1. `git fetch --all`
2. `git reset --hard origin/main`
3. `docker compose pull`
4. `docker compose up -d --build --remove-orphans`
5. `docker image prune -f`

## Важно

- У пользователя `VPS_USER` должен быть доступ к Docker (обычно через группу `docker`).
- На сервере уже должен быть склонирован репозиторий и заполнен `.env`.
- Если деплой нужен не из `main`, измените ветку в `on.push.branches` и в `git reset --hard origin/<branch>`.
