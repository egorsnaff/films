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

  if [[ "$need_api" == false && "$need_films" == false && "$need_proxy" == false ]]; then
    echo "→ Изменения не затрагивают образы, пересборка не нужна" >&2
    printf '%s' "__SKIP_BUILD__"
    return
  fi

  local services=()
  if [[ "$need_api" == true ]]; then
    services+=("api")
  fi
  if [[ "$need_films" == true ]]; then
    services+=("films")
  fi
  if [[ "$need_proxy" == true && "$COMPOSE_FILE" == "docker-compose.prod.yml" ]]; then
    services+=("proxy")
  fi

  printf '%s' "${services[*]}"
}

deploy_services() {
  local services=("$@")

  echo "→ Деплой (${COMPOSE_FILE}: ${services[*]})"

  if [[ "${DEPLOY_NO_CACHE:-}" == "1" || "${DEPLOY_NO_CACHE:-}" == "true" ]]; then
    echo "  режим DEPLOY_NO_CACHE: полная пересборка без кэша Docker" >&2
    # shellcheck disable=SC2086
    compose -f "$COMPOSE_FILE" build --no-cache "${services[@]}"
    # shellcheck disable=SC2086
    compose -f "$COMPOSE_FILE" up -d "${services[@]}"
    return
  fi

  if [[ -z "${DOCKER_BUILDKIT:-}" ]]; then
    if docker buildx version >/dev/null 2>&1; then
      export DOCKER_BUILDKIT=1
    else
      export DOCKER_BUILDKIT=0
      export COMPOSE_DOCKER_CLI_BUILD=0
    fi
  fi

  # shellcheck disable=SC2086
  compose -f "$COMPOSE_FILE" up -d --build "${services[@]}"
}

echo "→ Обновление из origin/${DEPLOY_BRANCH}"
PREVIOUS_REV=$(git rev-parse HEAD)
git fetch origin "$DEPLOY_BRANCH"
git reset --hard "origin/${DEPLOY_BRANCH}"
CURRENT_REV=$(git rev-parse HEAD)

TARGETS=$(detect_deploy_services "$PREVIOUS_REV" "$CURRENT_REV")

if [[ "$TARGETS" == "__SKIP_BUILD__" ]]; then
  compose -f "$COMPOSE_FILE" up -d
else
  # shellcheck disable=SC2206
  SERVICE_LIST=($TARGETS)
  deploy_services "${SERVICE_LIST[@]}"
  # Ensure the full stack stays up (certbot, proxy, etc.).
  compose -f "$COMPOSE_FILE" up -d
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
