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

Через Docker:

```bash
docker compose exec api npm run create-user -- egor your-strong-password
```

## Запуск API

В `docker-compose.yml` добавлен сервис `api` на порту **3001**.

В nginx на хосте (перед Cloudflare):

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3001/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

В `.env` на сервере:

```env
JWT_SECRET=длинный-случайный-секрет
CORS_ORIGIN=https://films.qzz.io
COOKIE_SECURE=true
API_HTTP_PORT=3001
```

Перезапуск:

```bash
docker compose up -d --build
```

## Подборки

Статические подборки лежат в `src/data/collections.ts`. Можно менять заголовки, описания и `kinopoiskIds` без бэкенда.
