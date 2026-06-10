#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck source=deploy/lib.sh
source "$ROOT_DIR/deploy/lib.sh"
resolve_compose

COMPOSE_FILE="$(resolve_compose_file)"
CURRENT_REV="$(git rev-parse HEAD 2>/dev/null || echo unknown)"

recover_stack "$COMPOSE_FILE" "$CURRENT_REV"

echo "→ Проверка после восстановления"
sleep 3

if [[ "$COMPOSE_FILE" == "docker-compose.prod.yml" ]]; then
  curl -fsS "http://127.0.0.1/api/health" >/dev/null
  curl -fsS "http://127.0.0.1/build-id.txt" >/dev/null
else
  films_port="${FILMS_HTTP_PORT:-8080}"
  curl -fsS "http://127.0.0.1:${films_port}/api/health" >/dev/null
  curl -fsS "http://127.0.0.1:${films_port}/build-id.txt" >/dev/null
fi

compose -f "$COMPOSE_FILE" ps
echo "→ Восстановление завершено"
