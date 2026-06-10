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

resolve_compose_file() {
  if [[ -n "${COMPOSE_FILE:-}" ]]; then
    printf '%s' "$COMPOSE_FILE"
    return
  fi

  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '_proxy_'; then
    printf '%s' "docker-compose.prod.yml"
    return
  fi

  printf '%s' "docker-compose.yml"
}

configure_docker_builder() {
  if [[ -n "${DOCKER_BUILDKIT:-}" ]]; then
    return
  fi

  if docker buildx version >/dev/null 2>&1; then
    export DOCKER_BUILDKIT=1
    return
  fi

  export DOCKER_BUILDKIT=0
  export COMPOSE_DOCKER_CLI_BUILD=0
}

remove_service_containers() {
  local compose_file="$1"
  local service="$2"
  local ids

  ids=$(compose -f "$compose_file" ps -q "$service" 2>/dev/null | tr '\n' ' ' | xargs echo -n 2>/dev/null || true)
  if [[ -n "$ids" ]]; then
    # shellcheck disable=SC2086
    docker rm -f $ids >/dev/null 2>&1 || true
  fi
}

# docker-compose 1.29 + new Docker Engine breaks on container recreate (KeyError: ContainerConfig).
# Remove containers with plain docker, then create missing services with --no-recreate.
replace_service() {
  local compose_file="$1"
  local service="$2"
  shift 2

  configure_docker_builder

  if [[ $# -gt 0 ]]; then
    # shellcheck disable=SC2086
    compose -f "$compose_file" build "$@" "$service"
  else
    compose -f "$compose_file" build "$service"
  fi

  compose -f "$compose_file" stop "$service" 2>/dev/null || true
  remove_service_containers "$compose_file" "$service"
  compose -f "$compose_file" up -d --no-deps --no-recreate "$service"
}

restart_image_service() {
  local compose_file="$1"
  local service="$2"

  compose -f "$compose_file" stop "$service" 2>/dev/null || true
  remove_service_containers "$compose_file" "$service"
  compose -f "$compose_file" up -d --no-deps --no-recreate "$service"
}

ensure_stack_running() {
  local compose_file="$1"
  compose -f "$compose_file" up -d --no-recreate
}

service_is_running() {
  local compose_file="$1"
  local service="$2"
  [[ -n "$(compose -f "$compose_file" ps -q "$service" 2>/dev/null | head -1)" ]]
}

recover_stack() {
  local compose_file="$1"
  local current_rev="${2:-unknown}"

  echo "→ Восстановление стека (${compose_file})" >&2
  export GIT_SHA="$current_rev"
  configure_docker_builder

  if ! service_is_running "$compose_file" api; then
    replace_service "$compose_file" api
  fi

  replace_service "$compose_file" films

  if [[ "$compose_file" == "docker-compose.prod.yml" ]]; then
    restart_image_service "$compose_file" proxy
    compose -f "$compose_file" up -d certbot 2>/dev/null || true
  fi

  ensure_stack_running "$compose_file"
}
