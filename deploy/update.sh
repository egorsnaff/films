#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck source=deploy/lib.sh
source "$ROOT_DIR/deploy/lib.sh"
resolve_compose

DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
DEPLOY_SERVICES="${DEPLOY_SERVICES:-}"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

COMPOSE_FILE="$(resolve_compose_file)"
echo "→ Compose file: ${COMPOSE_FILE}" >&2

read_deployed_films_rev() {
  if [[ "$COMPOSE_FILE" == "docker-compose.prod.yml" ]]; then
    curl -fsS "http://127.0.0.1/build-id.txt" 2>/dev/null | tr -d '\r\n' || true
    return
  fi

  local films_port="${FILMS_HTTP_PORT:-8080}"
  curl -fsS "http://127.0.0.1:${films_port}/build-id.txt" 2>/dev/null | tr -d '\r\n' || true
}

check_stack_health() {
  if [[ "$COMPOSE_FILE" == "docker-compose.prod.yml" ]]; then
    curl -fsS "http://127.0.0.1/api/health" >/dev/null
    curl -fsS "http://127.0.0.1/build-id.txt" >/dev/null
    return
  fi

  local api_port="${API_HTTP_PORT:-3001}"
  local films_port="${FILMS_HTTP_PORT:-8080}"
  curl -fsS "http://127.0.0.1:${api_port}/health" >/dev/null
  curl -fsS "http://127.0.0.1:${films_port}/api/health" >/dev/null
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

deploy_services() {
  local services=("$@")

  echo "→ Деплой (${COMPOSE_FILE}: ${services[*]})"
  export GIT_SHA="${CURRENT_REV}"

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

verify_deploy() {
  check_stack_health

  local deployed_rev
  deployed_rev=$(read_deployed_films_rev)
  echo "  films build-id: ${deployed_rev:-<missing>}"
  if [[ "$deployed_rev" != "$CURRENT_REV" ]]; then
    echo "  films build-id mismatch — деплой не обновил фронтенд" >&2
    return 1
  fi
}

echo "→ Обновление из origin/${DEPLOY_BRANCH}"
PREVIOUS_REV=$(git rev-parse HEAD)
git fetch origin "$DEPLOY_BRANCH"
git reset --hard "origin/${DEPLOY_BRANCH}"
CURRENT_REV=$(git rev-parse HEAD)
chmod +x deploy/*.sh 2>/dev/null || true

TARGETS=$(detect_deploy_services "$PREVIOUS_REV" "$CURRENT_REV")

if [[ "$TARGETS" == "__SKIP_BUILD__" ]]; then
  SERVICE_LIST=()
else
  # shellcheck disable=SC2206
  SERVICE_LIST=($TARGETS)
fi

ensure_films_matches_git "$CURRENT_REV" SERVICE_LIST

if ! service_is_running "$COMPOSE_FILE" films; then
  echo "→ films контейнер не запущен, добавляем в деплой" >&2
  append_service "films" SERVICE_LIST
fi

if [[ ${#SERVICE_LIST[@]} -eq 0 ]]; then
  echo "→ Образы актуальны, перезапускаем контейнеры" >&2
  ensure_stack_running "$COMPOSE_FILE"
else
  deploy_services "${SERVICE_LIST[@]}"
fi

echo "→ Проверка health"
sleep 3

if ! verify_deploy; then
  echo "→ Пробуем восстановить стек" >&2
  recover_stack "$COMPOSE_FILE" "$CURRENT_REV"
  sleep 3
  verify_deploy
fi

compose -f "$COMPOSE_FILE" ps
echo "→ Проверка Kinopoisk (нужен KINOPOISK_API_KEY в .env)"
if [[ "$COMPOSE_FILE" == "docker-compose.prod.yml" ]]; then
  if curl -fsS "http://127.0.0.1/api/health/kp" >/dev/null; then
    echo "  kinopoisk: ok"
    curl -fsS "http://127.0.0.1/api/health/kp/stats" 2>/dev/null | sed -n '1p' || true
  else
    echo "  kinopoisk: FAIL — проверьте KINOPOISK_API_KEY и docker compose logs api"
  fi
elif [[ "$COMPOSE_FILE" == "docker-compose.yml" ]]; then
  films_port="${FILMS_HTTP_PORT:-8080}"
  if curl -fsS "http://127.0.0.1:${films_port}/api/health/kp" >/dev/null; then
    echo "  kinopoisk: ok"
    curl -fsS "http://127.0.0.1:${films_port}/api/health/kp/stats" 2>/dev/null | sed -n '1p' || true
  else
    echo "  kinopoisk: FAIL — проверьте KINOPOISK_API_KEY и docker compose logs api"
  fi
fi
echo "→ Деплой завершён"
