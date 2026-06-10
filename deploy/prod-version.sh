#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SITE_URL="${SITE_URL:-https://films.qzz.io}"
API_URL="${API_URL:-${SITE_URL%/}/api/health}"

echo "→ Сайт: ${SITE_URL}"
if html=$(curl -fsS "$SITE_URL"); then
  echo "  title: $(printf '%s' "$html" | sed -n 's:.*<title>\(.*\)</title>.*:\1:p')"
  echo "  js:    $(printf '%s' "$html" | sed -n 's:.*src="/assets/\([^"]*\.js\)".*:\1:p' | head -1)"
  echo "  css:   $(printf '%s' "$html" | sed -n 's:.*href="/assets/\([^"]*\.css\)".*:\1:p' | head -1)"
  if printf '%s' "$html" | grep -q 'favicon.svg'; then
    echo "  favicon: favicon.svg (новый бренд Сеанс)"
  else
    echo "  favicon: нет (старая сборка)"
  fi
  build_id=$(curl -fsS "${SITE_URL%/}/build-id.txt" 2>/dev/null | tr -d '\r\n' || true)
  if [[ -n "$build_id" ]]; then
    echo "  build-id: ${build_id}"
  else
    echo "  build-id: <missing>"
  fi
else
  echo "  ошибка: не удалось загрузить HTML"
fi

echo "→ API: ${API_URL}"
if api=$(curl -fsS "$API_URL" 2>/dev/null); then
  echo "  ${api}"
else
  echo "  недоступен"
fi

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "→ Локальный main: $(git rev-parse --short origin/main 2>/dev/null || git rev-parse --short HEAD)"
  echo "  $(git log -1 --format='%s' origin/main 2>/dev/null || git log -1 --format='%s')"
fi

if [[ -d .git ]] && git remote get-url origin >/dev/null 2>&1; then
  echo "→ На сервере (если есть git): git -C /opt/films rev-parse --short HEAD"
fi
