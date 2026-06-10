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

uses_compose_v1() {
  [[ "${COMPOSE[0]}" == "docker-compose" ]]
}

# docker-compose 1.29 + new Docker Engine breaks on `up` recreate (KeyError: ContainerConfig).
# Replacing the container avoids the broken recreate path.
replace_service() {
  local compose_file="$1"
  local service="$2"
  shift 2

  if [[ $# -gt 0 ]]; then
    # shellcheck disable=SC2086
    compose -f "$compose_file" build "$@" "$service"
  else
    compose -f "$compose_file" build "$service"
  fi

  compose -f "$compose_file" stop "$service" 2>/dev/null || true
  compose -f "$compose_file" rm -f "$service" 2>/dev/null || true
  compose -f "$compose_file" up -d --no-deps "$service"
}

restart_image_service() {
  local compose_file="$1"
  local service="$2"

  compose -f "$compose_file" stop "$service" 2>/dev/null || true
  compose -f "$compose_file" rm -f "$service" 2>/dev/null || true
  compose -f "$compose_file" up -d --no-deps "$service"
}

ensure_stack_running() {
  local compose_file="$1"
  compose -f "$compose_file" up -d --no-recreate
}
