# Развёртывание на своём сервере

Этот гайд описывает переезд с GitHub Pages на VPS, домашний сервер или любой хост с Docker.

## Быстрый старт (Docker)

```bash
git clone https://github.com/egorsnaff/films.git
cd films
cp .env.production.example .env
# отредактируйте .env — ключи API и токены плееров

docker compose up -d --build
```

Сайт откроется на `http://<IP-сервера>:8080` (порт меняется через `FILMS_HTTP_PORT`).

## Сборка без Docker

Для корня домена (`https://films.example.com/`):

```bash
cp .env.production.example .env.production
# VITE_BASE_PATH=/ в .env.production

npm ci
npm run build:selfhost
```

Статика окажется в `dist/`. Раздайте её любым веб-сервером (nginx, Caddy, Apache) с fallback на `index.html` для SPA.

Пример nginx на хосте (без Docker) — см. `deploy/nginx.conf`.

## Переменные окружения

| Переменная | Назначение |
|------------|------------|
| `VITE_BASE_PATH` | `/` для своего сервера, `/films/` для GitHub Pages |
| `VITE_KINOPOISK_API_KEY` | Ключ Kinopoisk Unofficial API |
| `VITE_PLAYER_EMBED_DOMAIN` | Домен, внесённый в whitelist Alloha/Kinobox |
| `VITE_ALLOHA_TOKEN` | Токен Alloha |
| `FILMS_HTTP_PORT` | Порт Docker-контейнера на хосте (по умолчанию 8080) |

Полный список — в `.env.example` и `.env.production.example`.

## HTTPS и reverse proxy

Docker-образ отдаёт только HTTP на порту 80 внутри контейнера. Для HTTPS поставьте перед ним Caddy или nginx на хосте:

```nginx
server {
    listen 443 ssl http2;
    server_name films.example.com;

    ssl_certificate     /etc/letsencrypt/live/films.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/films.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Let's Encrypt (`certbot`) выдаёт бесплатные SSL-сертификаты, если у вас есть **любое** публичное имя, указывающее на сервер (см. раздел про домены ниже).

Альтернатива без открытия портов: [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) — бесплатный HTTPS-туннель к `localhost:8080`.

---

## Домен: бесплатные и «локальные» варианты

### Нужен ли домен вообще?

| Сценарий | Что использовать | Плееры (Alloha/Kinobox) |
|----------|------------------|-------------------------|
| Только для себя в локальной сети | IP + порт или `films.local` через `/etc/hosts` | Обычно **не работают** — домен не в whitelist |
| Доступ из интернета без покупки домена | Бесплатный поддомен (DuckDNS, sslip.io) | Работают **после** добавления домена в whitelist Alloha |
| Продакшен для друзей/семьи | Дешёвый `.ru` / `.com` (~200–1000 ₽/год) | Работают после whitelist |

### Полностью бесплатные имена (публичные)

1. **DuckDNS** — `https://www.duckdns.org`  
   Поддомен вида `myfilms.duckdns.org`, привязка к IP, обновление через скрипт. Подходит для домашнего сервера с белым IP.

2. **sslip.io / nip.io** — без регистрации  
   Имя строится из IP: `203-0-113-10.sslip.io` → `203.0.113.10`. Удобно для теста, неудобно как постоянный адрес.

3. **Cloudflare Tunnel** (бесплатный план)  
   Можно получить адрес `*.trycloudflare.com` или привязать свой домен позже. HTTPS из коробки.

4. **GitHub Pages** (уже используется)  
   `egorsnaff.github.io/films/` — бесплатно, но это подпуть, не свой бренд.

> Сервис **Freenom** (.tk, .ml и т.п.) фактически закрыт — на него рассчитывать не стоит.

### «Локальный» домен (только у вас)

1. **`localhost` / `127.0.0.1`** — только на той же машине, где крутится сервер.

2. **`/etc/hosts` (Windows: `C:\Windows\System32\drivers\etc\hosts`)**  
   ```
   192.168.1.50   films.home
   ```  
   Работает в вашей сети на всех устройствах, где прописана эта строка. Для других людей в интернете адрес недоступен.

3. **mDNS (`.local`)** — `films-server.local` на Mac/Linux в локалке, если настроен Avahi/Bonjour.

Локальные имена **не заменяют** публичный домен для embed-плееров: Alloha проверяет whitelist по hostname.

### Дешёвый нормальный домен

Если нужен «настоящий» адрес для друзей:

- **.ru** — часто 200–500 ₽/год (REG.RU, Timeweb, Beget и др.)
- **.com** — от ~800 ₽/год у бюджетных регистраторов

После покупки: A-запись на IP сервера → certbot → обновить `VITE_PLAYER_EMBED_DOMAIN` и запросить whitelist у Alloha.

### Важно про плееры при переезде

Сайт может жить на **новом** URL, а плееры — на **старом** whitelist-домене:

```env
# Сайт: https://myfilms.duckdns.org
# Плееры пока с доменом hometv:
VITE_PLAYER_EMBED_DOMAIN=nayteruz.github.io
```

Так Alloha продолжит работать, пока вы не добавите новый домен в панель балансера. Для Kinobox — тот же параметр `domain` в API.

---

## Обновление после деплоя

```bash
git pull
docker compose up -d --build
```

## GitHub Pages параллельно

`npm run build` (alias `build:pages`) по-прежнему собирает с `base: /films/` для Pages. Self-host и Pages не конфликтуют — разные команды сборки.

## Что можно добавить позже

- **Backend-прокси** для API-ключей (сейчас ключи попадают в JS-бандл — типично для статики, но на своём сервере можно спрятать их за nginx/Node).
- **CI deploy** на VPS через SSH или Watchtower для автообновления образа.
