# Авторизация и списки просмотра

## Как устроено

- Публичной регистрации **нет** — пользователей добавляете только вы на сервере.
- **Сайт закрыт без входа:** каталог и Kinopoisk-прокси (`/api/kp/*`) доступны только после авторизации. На фронте показывается экран входа.
- Для локальной разработки без gate: `AUTH_GATE_ENABLED=false` на API, `VITE_AUTH_GATE=false` во frontend (см. `.env.example`).
- Логин/пароль хранятся в SQLite (`films.db`).
- После входа доступны списки:
  - **Смотрю сейчас** (`watching`) — выставляется автоматически по прогрессу плеера
  - **Буду смотреть** (`plan`) — кнопка на странице фильма
  - **Просмотренное** (`watched`) — кнопка на странице фильма
- Повторный клик по активной кнопке убирает фильм из списка.
- **Кто онлайн** — кнопка в шапке рядом с меню профиля, по клику открывается список: кто сейчас на сайте и что делает (фильм показывается конкретно, остальное коротко). Вкладка шлёт `POST /presence` раз в 15 с (скрытая — раз в минуту) и сразу при смене действия; статусы хранятся только в памяти API, онлайн — активность за последние 90 с.
- **Общий список** в профиле — объединённый «Буду смотреть» пользователей из `SHARED_LIST_MEMBERS` в `server/src/sharedList.ts` (видят только они).

## Телеграм-бот

Бот запускается внутри API (long polling, вебхук не нужен), если в `.env` на сервере задан токен:

```bash
TELEGRAM_BOT_TOKEN=123456:ABC...        # от @BotFather
TELEGRAM_USERS=egor:111111111,kseniya:222222222   # логин на сайте:Telegram ID
# SITE_URL=https://films.qzz.io         # куда ведёт ссылка «Смотреть на сайте»
```

- Пишете боту название — он ищет в Кинопоиске и присылает карточку лучшего совпадения: постер, жанры, длительность, рейтинги, награды, описание и ссылку на страницу фильма на сайте.
- Кнопки под карточкой: «Мне», «Ксении»/«Егору» — в «Буду смотреть» этому человеку, «В общий список» — в «Буду смотреть» обоим. Если добавили другому, ему приходит уведомление.
- «Не тот? Другие варианты» — остальные результаты поиска.
- Незнакомым пользователям бот отвечает только их Telegram ID (его и нужно вписать в `TELEGRAM_USERS`), поиск для них не выполняется.
- После изменения `.env`: `docker compose -f docker-compose.prod.yml up -d api`.

## Создать пользователя на сервере

```bash
cd /opt/films/server
npm install
npm run create-user -- egor your-strong-password
```

Через Docker (на ServerSpace обычно `docker-compose` с дефисом):

```bash
docker-compose exec api npm run create-user -- egor your-strong-password
```

## Запуск API

`docker-compose.yml` поднимает два сервиса: `films` (сайт) и `api` (авторизация).

**Важно:** nginx внутри контейнера `films` сам проксирует `/api/` → `api:3001`.  
На хосте достаточно одного блока:

```nginx
server {
    listen 80;
    server_name films.qzz.io;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Отдельный `location /api/` на `127.0.0.1:3001` **не нужен** (и может дать 502, если порт 3001 снаружи закрыт).

В `.env` на сервере:

```env
JWT_SECRET=длинный-случайный-секрет
CORS_ORIGIN=https://films.qzz.io
COOKIE_SECURE=true
```

Перезапуск:

```bash
docker-compose up -d --build
```

## Если API возвращает 404 (вход, списки)

Чаще всего запрос доходит до API с лишним префиксом `/api` (`/api/auth/login` вместо `/auth/login`).

**На сервере проверьте:**

```bash
# должно быть {"ok":true}
curl -s http://127.0.0.1:8080/api/health

# должно вернуть user или 401, но НЕ 404
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"egor","password":"test"}'
```

| Симптом | Причина | Решение |
|---------|---------|---------|
| `:3001/health` OK, `:8080/api/*` → 404 | nginx в контейнере `films` не срезает `/api` | `git pull` + пересобрать `films` |
| `:3001/health` OK, `:8080/api/*` → 500 | сломанный `proxy_pass` с переменной | обновить `deploy/nginx.conf`, пересобрать `films` |
| `:8080/api/*` → 502 | контейнер `api` не запущен | `docker-compose ps`, `docker-compose logs api` |
| через домен 404, локально OK | на **хосте** лишний `location /api/` → `:3001` | оставить только `proxy_pass` на `:8080` (см. выше) |

Пересборка:

```bash
docker-compose build --no-cache films
docker-compose up -d films
```

## Если `/api/health` возвращает 502

```bash
cd /opt/films
docker-compose ps
docker-compose logs --tail=50 api
curl -s http://127.0.0.1:3001/health
```

| Симптом | Причина | Решение |
|---------|---------|---------|
| `api` нет в `ps` или `Exit` | контейнер не запущен / упал | `docker-compose up -d --build api` |
| `:3001/health` OK, `:8080/api/health` 502 | films не видит api в сети | `docker-compose down && docker-compose up -d --build` |
| оба 502 / connection refused | api не слушает порт | смотреть `docker-compose logs api` |

Полный перезапуск:

```bash
docker-compose down
docker-compose build --no-cache api films
docker-compose up -d
sleep 5
curl -s http://127.0.0.1:3001/health
curl -s http://127.0.0.1:8080/api/health
```

## Проверка API

```bash
docker-compose ps
curl -s http://127.0.0.1:8080/api/health
curl -s -X POST http://127.0.0.1:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"egor","password":"your-password"}'
```

Через домен:

```bash
curl -s https://films.qzz.io/api/health
```

## Подборки и Kinopoisk

Подборки описаны в `src/data/collections.ts` и подгружаются через официальные эндпоинты Kinopoisk Unofficial API (`top`, `collections`) — **один запрос на подборку**, а не `getFilm` на каждый фильм.

Браузер не ходит в Kinopoisk напрямую: фронт вызывает `/api/kp/*`, бэкенд кэширует ответы в SQLite (`kp_cache`, `films_cache`). Ключ API задаётся только на сервере: `KINOPOISK_API_KEY` в `.env`.

| TTL | Данные |
|-----|--------|
| 30 дней | карточка фильма |
| 6 часов | каталог новинок |
| 2 часа | поиск |
| 24 часа | топы и тематические подборки |

На клиенте дополнительно кэш в `localStorage` (`src/lib/kpLocalCache.ts`).
