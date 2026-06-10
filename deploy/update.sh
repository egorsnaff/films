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

read_deployed_films_rev() {
  local films_port="${FILMS_HTTP_PORT:-8080}"
  curl -fsS "http://127.0.0.1:${films_port}/build-id.txt" 2>/dev/null | tr -d '\r\n' || true
}

contains_service() {
  local needle="$1"
  shift
  local service
  for service in "$@"; do
    if [[ "$service" == "$needle" ]]; then
      return 0
    fi
  done
  return 1
}

append_service() {
  local needle="$1"
  shift
  local -n target_ref=$1
  if ! contains_service "$needle" "${target_ref[@]}"; then
    target_ref+=("$needle")
  fi
}

# Returns a space-separated service list, or "__SKIP_BUILD__" when images are unchanged.
detect_deploy_services() {
  local previous_rev="$1"
  local current_rev="$2"

  if [[ -n "$DEPLOY_SERVICES" ]]; then
    printf '%s' "$DEPLOY_SERVICES"
    return
  fi

  if [[ "$previous_rev" == "$current_rev" ]]; then
    echo "→ Коммит не изменился, пересборка образов не нужна" >&2
    printf '%s' "__SKIP_BUILD__"
    return
  fi

  local changed_files
  changed_files=$(git diff --name-only "$previous_rev" "$current_rev")

  if [[ -z "$changed_files" ]]; then
    echo "→ Нет изменений в файлах, пересборка образов не нужна" >&2
    printf '%s' "__SKIP_BUILD__"
    return
  fi

  local services=()
  local need_api=false
  local need_films=false
  local need_proxy=false

  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    case "$file" in
      server/*)
        need_api=true
        ;;
      src/*|public/*|index.html|vite.config.ts|vite.config.js|Dockerfile|package.json|package-lock.json|deploy/nginx.conf|tsconfig.json|tsconfig.node.json)
        need_films=true
        ;;
      deploy/proxy/*)
        need_proxy=true
        ;;
      docker-compose.yml|docker-compose.prod.yml)
        need_api=true
        need_films=true
        if [[ "$COMPOSE_FILE" == "docker-compose.prod.yml" ]]; then
          need_proxy=true
        fi
        ;;
    esac
  done <<< "$changed_files"

  if [[ "$need_api" == true ]]; then
    services+=("api")
  fi
  if [[ "$need_films" == true ]]; then
    services+=("films")
  fi
  if [[ "$need_proxy" == true && "$COMPOSE_FILE" == "docker-compose.prod.yml" ]]; then
    services+=("proxy")
  fi

  if [[ ${#services[@]} -eq 0 ]]; then
    echo "→ Изменения не затрагивают образы, пересборка не нужна" >&2
    printf '%s' "__SKIP_BUILD__"
    return
  fi

  printf '%s' "${services[*]}"
}

ensure_films_matches_git() {
  local current_rev="$1"
  local -n services_ref=$2
  local deployed_rev

  deployed_rev=$(read_deployed_films_rev)
  if [[ "$deployed_rev" == "$current_rev" ]]; then
    return
  fi

  echo "→ films на сервере: ${deployed_rev:-<старая сборка>}, в git: ${current_rev:0:12} — пересобираем films" >&2
  append_service "films" services_ref
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

deploy_services() {
  local services=("$@")

  echo "→ Деплой (${COMPOSE_FILE}: ${services[*]})"
  export GIT_SHA="${CURRENT_REV}"
  configure_docker_builder

  local service
  for service in "${services[@]}"; do
    if [[ "$service" == "proxy" ]]; then
      restart_image_service "$COMPOSE_FILE" "$service"
      continue
    fi

    if [[ "${DEPLOY_NO_CACHE:-}" == "1" || "${DEPLOY_NO_CACHE:-}" == "true" ]]; then
      replace_service "$COMPOSE_FILE" "$service" --no-cache
    else
      replace_service "$COMPOSE_FILE" "$service"
    fi
  done

  ensure_stack_running "$COMPOSE_FILE"
}

echo "→ Обновление из origin/${DEPLOY_BRANCH}"
PREVIOUS_REV=$(git rev-parse HEAD)
git fetch origin "$DEPLOY_BRANCH"
git reset --hard "origin/${DEPLOY_BRANCH}"
CURRENT_REV=$(git rev-parse HEAD)

TARGETS=$(detect_deploy_services "$PREVIOUS_REV" "$CURRENT_REV")

if [[ "$TARGETS" == "__SKIP_BUILD__" ]]; then
  SERVICE_LIST=()
else
  # shellcheck disable=SC2206
  SERVICE_LIST=($TARGETS)
fi

ensure_films_matches_git "$CURRENT_REV" SERVICE_LIST

if [[ ${#SERVICE_LIST[@]} -eq 0 ]]; then
  echo "→ Образы актуальны, перезапускаем контейнеры" >&2
  ensure_stack_running "$COMPOSE_FILE"
else
  deploy_services "${SERVICE_LIST[@]}"
fi

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
  deployed_rev=$(read_deployed_films_rev)
  echo "  films build-id: ${deployed_rev:-<missing>}"
  if [[ "$deployed_rev" != "$CURRENT_REV" ]]; then
    echo "  films build-id mismatch — деплой не обновил фронтенд" >&2
    exit 1
  fi
fi

if [[ "$COMPOSE_FILE" == "docker-compose.prod.yml" ]]; then
  curl -fsS "http://127.0.0.1/api/health" >/dev/null
  echo "  proxy/api health: ok"
  deployed_rev=$(curl -fsS "http://127.0.0.1/build-id.txt" 2>/dev/null | tr -d '\r\n' || true)
  echo "  films build-id: ${deployed_rev:-<missing>}"
  if [[ "$deployed_rev" != "$CURRENT_REV" ]]; then
    echo "  films build-id mismatch — деплой не обновил фронтенд" >&2
    exit 1
  fi
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
