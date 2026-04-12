# Переезд ZavodGram на новую VPS (Debian 12)

Цель: перевести проект на VPS `178.130.53.15` и домен `web.zavodgram.ru`.

---

## Быстрый вариант (рекомендуется)

Если ты под `root`, можно выполнить bootstrap-скрипт из этого репозитория:

```bash
cd /opt
git clone <URL_ВАШЕГО_РЕПО> ZavodGram
cd /opt/ZavodGram

REPO_URL=<URL_ВАШЕГО_РЕПО> \
DOMAIN=web.zavodgram.ru \
EMAIL=admin@zavodgram.ru \
bash scripts/bootstrap-vps-debian12.sh
```

Скрипт:

- ставит Docker, Nginx, Certbot;
- включает firewall (22/80/443);
- поднимает `docker compose up -d --build`;
- подключает nginx-конфиг;
- выпускает TLS-сертификат.

---

## Пошагово вручную

## 1) DNS

Добавь или измени A-запись:

- `web.zavodgram.ru` -> `178.130.53.15`

Проверка:

```bash
dig +short web.zavodgram.ru
# ожидается: 178.130.53.15
```

## 2) Базовая подготовка VPS (root)

```bash
apt update && apt -y upgrade
apt -y install ca-certificates curl gnupg lsb-release git ufw

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status
```

## 3) Docker + Compose plugin

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

## 4) Проект и `.env`

```bash
mkdir -p /opt && cd /opt
git clone <URL_ВАШЕГО_РЕПО> ZavodGram
cd /opt/ZavodGram
cp example.env .env
```

Заполни как минимум:

- `DB_PASSWORD`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `CORS_ORIGIN=https://web.zavodgram.ru`
- Telegram переменные (если бот нужен в проде)

## 5) Поднять приложение

```bash
cd /opt/ZavodGram
docker compose pull
docker compose up -d --build
docker compose ps
```

Проверка локально на сервере:

```bash
curl -I http://127.0.0.1:3081
curl -I http://127.0.0.1:4000/api/health || true
```

## 6) Nginx + HTTPS

```bash
apt -y install nginx certbot python3-certbot-nginx
cp /opt/ZavodGram/nginx/sites-available/web.zavodgram.ru /etc/nginx/sites-available/web.zavodgram.ru
ln -sf /etc/nginx/sites-available/web.zavodgram.ru /etc/nginx/sites-enabled/web.zavodgram.ru
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

Сертификат:

```bash
certbot --nginx -d web.zavodgram.ru --redirect -m admin@zavodgram.ru --agree-tos -n
systemctl reload nginx
```

---

## Миграция данных со старого VPS

> Делай перенос данных до финального переключения трафика.

### PostgreSQL dump/restore

На старой VPS:

```bash
docker exec -t zavodgram-db pg_dump -U zavodgram -d zavodgram -Fc > /root/zavodgram.dump
```

Скопировать на новую VPS:

```bash
scp /root/zavodgram.dump root@178.130.53.15:/root/
```

На новой VPS:

```bash
docker cp /root/zavodgram.dump zavodgram-db:/tmp/zavodgram.dump
docker exec -it zavodgram-db pg_restore -U zavodgram -d zavodgram --clean --if-exists /tmp/zavodgram.dump
```

### Uploads

На старой VPS:

```bash
tar -C /var/lib/docker/volumes -czf /root/uploads.tar.gz zavodgram_uploads/_data
scp /root/uploads.tar.gz root@178.130.53.15:/root/
```

На новой VPS:

```bash
tar -C /var/lib/docker/volumes -xzf /root/uploads.tar.gz
docker compose -f /opt/ZavodGram/docker-compose.yml restart backend
```

---

## Финальный cutover

1. Убедись, что на новой VPS всё ок по `https://web.zavodgram.ru`.
2. Переключи/проверь DNS на `178.130.53.15`.
3. Оставь старую VPS включенной 24-48 часов.
4. Мониторь логи и ошибки.

---

## Диагностика

```bash
cd /opt/ZavodGram
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
journalctl -u nginx -f
```

## Чек-лист

- [ ] DNS `web.zavodgram.ru` -> `178.130.53.15`
- [ ] `docker compose ps` показывает сервисы `Up`
- [ ] Сайт открывается по HTTPS
- [ ] API работает через `/api/`
- [ ] WebSocket работает через `/socket.io/`
