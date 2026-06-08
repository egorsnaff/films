#!/usr/bin/env bash

resolve_compose() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE=(docker compose)
    return 0
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE=(docker-compose)
    return 0
  fi

  cat <<'EOF'
Docker Compose не найден.

Установите один из вариантов:

  # Рекомендуется (Compose v2 plugin):
  apt update && apt install -y docker-compose-plugin
  docker compose version

  # Или standalone v1:
  apt install -y docker-compose
  docker-compose version

После установки снова запустите ./deploy/deploy.sh
EOF
  exit 1
}

compose() {
  "${COMPOSE[@]}" "$@"
}
