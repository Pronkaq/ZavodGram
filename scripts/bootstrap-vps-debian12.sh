#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root"
  exit 1
fi

DOMAIN="${DOMAIN:-web.zavodgram.ru}"
EMAIL="${EMAIL:-admin@zavodgram.ru}"
REPO_URL="${REPO_URL:-}"
APP_DIR="${APP_DIR:-/opt/ZavodGram}"

if [[ -z "$REPO_URL" ]]; then
  echo "Set REPO_URL, example:"
  echo "  REPO_URL=git@github.com:<org>/<repo>.git bash scripts/bootstrap-vps-debian12.sh"
  exit 1
fi

echo "==> Install base packages"
apt update
apt -y upgrade
apt -y install ca-certificates curl gnupg lsb-release git ufw nginx certbot python3-certbot-nginx

echo "==> Firewall"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> Docker repo"
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list

apt update
apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker

echo "==> Clone app"
mkdir -p "$(dirname "$APP_DIR")"
if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

if [[ ! -f .env ]]; then
  cp example.env .env
  echo "Created .env from example.env. Fill secrets before going to production."
fi

echo "==> Start containers"
docker compose up -d --build

echo "==> Nginx site"
cp "$APP_DIR/nginx/sites-available/web.zavodgram.ru" "/etc/nginx/sites-available/$DOMAIN"
sed -i "s/web\.zavodgram\.ru/$DOMAIN/g" "/etc/nginx/sites-available/$DOMAIN"
ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "==> Request certificate"
certbot --nginx -d "$DOMAIN" --redirect -m "$EMAIL" --agree-tos -n
systemctl reload nginx

echo "==> Done"
echo "Open: https://$DOMAIN"
