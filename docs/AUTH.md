# Авторизация и списки просмотра

## Как устроено

- Публичной регистрации **нет** — пользователей добавляете только вы на сервере.
- Логин/пароль хранятся в SQLite (`films.db`).
- После входа доступны списки:
  - **Смотрю сейчас** (`watching`)
  - **Буду смотреть** (`plan`)
  - **Жду продолжения** (`waiting`) — для сериалов
  - **Просмотренное** (`watched`)
- Один фильм — один статус. Повторный клик по активной кнопке убирает фильм из списков.

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

## Подборки

Статические подборки лежат в `src/data/collections.ts`. Можно менять заголовки, описания и `kinopoiskIds` без бэкенда.
