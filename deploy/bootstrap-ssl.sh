#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck source=deploy/lib.sh
source "$ROOT_DIR/deploy/lib.sh"
resolve_compose

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

FILMS_DOMAIN="${FILMS_DOMAIN:-films.qzz.io}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"

if [[ -z "$CERTBOT_EMAIL" ]]; then
  echo "Укажите CERTBOT_EMAIL в .env (нужен для Let's Encrypt)."
  exit 1
fi

export FILMS_DOMAIN

render_proxy_config() {
  local template="$1"
  local output="$2"
  if command -v envsubst >/dev/null 2>&1; then
    envsubst '${FILMS_DOMAIN}' < "$template" > "$output"
  else
    sed "s/\${FILMS_DOMAIN}/${FILMS_DOMAIN}/g" "$template" > "$output"
  fi
}

mkdir -p deploy/proxy/active
render_proxy_config deploy/proxy/films.http.conf.template deploy/proxy/active/films.conf

echo "→ HTTP-конфиг для $FILMS_DOMAIN"
compose -f docker-compose.prod.yml up -d --build proxy films

echo "→ Ждём nginx..."
sleep 3

if compose -f docker-compose.prod.yml exec proxy test -f "/etc/letsencrypt/live/${FILMS_DOMAIN}/fullchain.pem"; then
  echo "→ Сертификат уже есть, включаем HTTPS"
else
  echo "→ Запрашиваем сертификат Let's Encrypt..."
  compose -f docker-compose.prod.yml run --rm --entrypoint certbot certbot certonly \
    --webroot \
    -w /var/www/certbot \
    -d "$FILMS_DOMAIN" \
    --email "$CERTBOT_EMAIL" \
    --agree-tos \
    --no-eff-email
fi

render_proxy_config deploy/proxy/films.https.conf.template deploy/proxy/active/films.conf
compose -f docker-compose.prod.yml exec proxy nginx -t
compose -f docker-compose.prod.yml exec proxy nginx -s reload

compose -f docker-compose.prod.yml up -d

echo ""
echo "Готово: https://${FILMS_DOMAIN}"
