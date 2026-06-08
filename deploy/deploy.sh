#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILE="docker-compose.prod.yml"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

FILMS_DOMAIN="${FILMS_DOMAIN:-films.qzz.io}"
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

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Не найдена команда: $1"
    exit 1
  fi
}

require_command docker
docker compose version >/dev/null 2>&1 || {
  echo "Нужен Docker Compose v2 (команда: docker compose)"
  exit 1
}

if [[ ! -f .env ]]; then
  echo "Создайте .env из .env.production.example и заполните ключи API."
  exit 1
fi

mkdir -p deploy/proxy/active

if [[ ! -f deploy/proxy/active/films.conf ]]; then
  render_proxy_config deploy/proxy/films.http.conf.template deploy/proxy/active/films.conf
fi

echo "→ Сборка и запуск (домен: $FILMS_DOMAIN)"
docker compose -f "$COMPOSE_FILE" up -d --build

if [[ -n "${CERTBOT_EMAIL:-}" ]]; then
  if docker compose -f "$COMPOSE_FILE" exec proxy test -f "/etc/letsencrypt/live/${FILMS_DOMAIN}/fullchain.pem" 2>/dev/null; then
    echo "→ Сертификат найден, HTTPS уже настроен"
  else
    echo "→ Для HTTPS выполните: ./deploy/bootstrap-ssl.sh"
  fi
else
  echo "→ Сайт на http://${FILMS_DOMAIN:-<IP>}:80"
  echo "→ Для HTTPS добавьте CERTBOT_EMAIL в .env и запустите ./deploy/bootstrap-ssl.sh"
fi
