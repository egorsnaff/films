#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck source=deploy/lib.sh
source "$ROOT_DIR/deploy/lib.sh"
resolve_compose

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
DEPLOY_SERVICES="${DEPLOY_SERVICES:-}"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [[ -z "$DEPLOY_SERVICES" ]]; then
  if [[ "$COMPOSE_FILE" == "docker-compose.prod.yml" ]]; then
    DEPLOY_SERVICES="api films proxy"
  else
    DEPLOY_SERVICES="api films"
  fi
fi

echo "→ Обновление из origin/${DEPLOY_BRANCH}"
git fetch origin "$DEPLOY_BRANCH"
git reset --hard "origin/${DEPLOY_BRANCH}"

echo "→ Пересборка (${COMPOSE_FILE}: ${DEPLOY_SERVICES})"
compose -f "$COMPOSE_FILE" down
# shellcheck disable=SC2086
compose -f "$COMPOSE_FILE" build --no-cache $DEPLOY_SERVICES
compose -f "$COMPOSE_FILE" up -d

echo "→ Проверка health"
sleep 3

if [[ "$COMPOSE_FILE" == "docker-compose.yml" ]]; then
  api_port="${API_HTTP_PORT:-3001}"
  curl -fsS "http://127.0.0.1:${api_port}/health" >/dev/null
  echo "  api: ok"
fi

if [[ "$COMPOSE_FILE" == "docker-compose.yml" ]]; then
  films_port="${FILMS_HTTP_PORT:-8080}"
  curl -fsS "http://127.0.0.1:${films_port}/api/health" >/dev/null
  echo "  films/api proxy: ok"
fi

if [[ "$COMPOSE_FILE" == "docker-compose.prod.yml" ]]; then
  curl -fsS "http://127.0.0.1/api/health" >/dev/null
  echo "  proxy/api health: ok"
fi

compose -f "$COMPOSE_FILE" ps
echo "→ Проверка Kinopoisk (нужен KINOPOISK_API_KEY в .env)"
if [[ "$COMPOSE_FILE" == "docker-compose.prod.yml" ]]; then
  curl -fsS "http://127.0.0.1/api/health/kp" >/dev/null && echo "  kinopoisk: ok" || echo "  kinopoisk: FAIL — проверьте KINOPOISK_API_KEY и docker compose logs api"
elif [[ "$COMPOSE_FILE" == "docker-compose.yml" ]]; then
  films_port="${FILMS_HTTP_PORT:-8080}"
  curl -fsS "http://127.0.0.1:${films_port}/api/health/kp" >/dev/null && echo "  kinopoisk: ok" || echo "  kinopoisk: FAIL — проверьте KINOPOISK_API_KEY и docker compose logs api"
fi
echo "→ Деплой завершён"
