# Переезд ZavodGram на новую VPS (Debian 12)

Цель: поднять проект на новой машине `178.130.53.15` и перевести домен на `web.zavodgram.ru`.

## 1) Подготовка DNS

У регистратора/в DNS-зоне нужно создать или изменить A-запись:

- `web.zavodgram.ru` -> `178.130.53.15`

Проверка (локально или на сервере):

```bash
dig +short web.zavodgram.ru
# ожидается: 178.130.53.15
```

> Важно: выпуск Let's Encrypt-сертификата заработает только после того, как DNS уже укажет на новую VPS.

## 2) Базовая настройка сервера (под root)

```bash
apt update && apt -y upgrade
apt -y install ca-certificates curl gnupg lsb-release git ufw
```

### Firewall

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status
```

## 3) Установка Docker и Docker Compose plugin

```bash
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
  $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" \
  > /etc/apt/sources.list.d/docker.list

apt update
apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
```

Проверка:

```bash
docker --version
docker compose version
```

## 4) Клонирование проекта и env

```bash
mkdir -p /opt && cd /opt
git clone <URL_ВАШЕГО_РЕПО> ZavodGram
cd /opt/ZavodGram
cp example.env .env
```

Отредактируй `.env` (минимум):

- `DB_PASSWORD`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `CORS_ORIGIN=https://web.zavodgram.ru`
- Telegram-переменные (если бот нужен в проде)

## 5) Запуск контейнеров

```bash
cd /opt/ZavodGram
docker compose pull
docker compose up -d --build
docker compose ps
```

Проверка локально на VPS:

```bash
curl -I http://127.0.0.1:3081
curl -I http://127.0.0.1:4000/api/health || true
```

## 6) Nginx + HTTPS (Let's Encrypt)

```bash
apt -y install nginx certbot python3-certbot-nginx
```

Положи конфиг сайта:

```bash
cp /opt/ZavodGram/nginx/sites-available/web.zavodgram.ru /etc/nginx/sites-available/web.zavodgram.ru
ln -sf /etc/nginx/sites-available/web.zavodgram.ru /etc/nginx/sites-enabled/web.zavodgram.ru
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

Выпусти сертификат:

```bash
certbot --nginx -d web.zavodgram.ru --redirect -m admin@zavodgram.ru --agree-tos -n
systemctl reload nginx
```

Проверка:

```bash
curl -I https://web.zavodgram.ru
```

## 7) Что делать со старым сервером

После переключения DNS и проверки новой VPS:

1. Оставь старую VPS на 24-48 часов (на случай DNS-кеша).
2. Сними бэкап БД и uploads на новой VPS.
3. Только после этого выключай старый сервер.

## 8) Полезные команды диагностики

```bash
docker compose logs -f backend
docker compose logs -f frontend
journalctl -u nginx -f
systemctl status nginx
```

## 9) Быстрый чек-лист после переезда

- [ ] DNS `web.zavodgram.ru` указывает на `178.130.53.15`
- [ ] `docker compose ps` показывает все сервисы `Up`
- [ ] `https://web.zavodgram.ru` открывается
- [ ] API отвечает за nginx (`/api/...`)
- [ ] WebSocket на `/socket.io/` работает
