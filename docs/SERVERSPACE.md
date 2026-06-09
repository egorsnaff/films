# Деплой на ServerSpace + домен films.qzz.io

Пошаговая инструкция для VPS в [my.serverspace.ru](https://my.serverspace.ru) и домена **films.qzz.io**.

## Схема

```text
Интернет → films.qzz.io (DNS A → IP VPS)
         → nginx proxy :443 (Let's Encrypt)
         → контейнер films (React SPA)
```

---

## Шаг 1. Узнайте IP сервера

1. Войдите в [my.serverspace.ru](https://my.serverspace.ru).
2. Откройте ваш VPS.
3. Скопируйте **публичный IPv4** (например `185.x.x.x`).

Этот IP понадобится для DNS.

---

## Шаг 2. Подключите домен films.qzz.io

У вас уже есть поддомен **films.qzz.io** на платформе qzz.io. Нужно направить его на IP ServerSpace.

### Вариант A — DNS прямо в панели qzz.io (проще)

1. Откройте панель управления доменом на qzz.io (раздел **My domains**).
2. Выберите **films.qzz.io**.
3. Добавьте или измените запись:

| Тип | Имя / Host | Значение | TTL |
|-----|------------|----------|-----|
| **A** | `@` или `films` | `185.x.x.x` (IP вашего VPS) | 300–3600 |

> Если панель просит только «Target IP» при регистрации поддомена — укажите IP VPS там же.

4. Подождите 5–30 минут (иногда до 2 часов).
5. Проверка с вашего ПК:
   ```bash
   ping films.qzz.io
   # или
   dig +short films.qzz.io
   ```
   Должен вернуться IP вашего ServerSpace VPS.

### Вариант B — через Cloudflare (опционально)

Если qzz.io позволяет сменить NS-записи:

1. Добавьте `films.qzz.io` в [Cloudflare](https://dash.cloudflare.com) (бесплатный план).
2. Cloudflare выдаст два nameserver'а (`xxx.ns.cloudflare.com`).
3. В панели qzz.io → **Nameservers** → вставьте их и сохраните.
4. В Cloudflare → **DNS** → **Add record**:
   - Type: **A**
   - Name: `@` (если зона `films.qzz.io`) или `films` (если зона `qzz.io`)
   - Content: IP VPS
   - Proxy: **DNS only** (серое облако) на первом деплое — так проще пройти проверку Let's Encrypt.

---

## Шаг 3. Подготовьте VPS (один раз)

Подключитесь по SSH (логин/пароль или ключ — из панели ServerSpace):

```bash
ssh root@185.x.x.x
```

Установите Docker (Ubuntu 22.04/24.04):

```bash
apt update && apt install -y git curl gettext-base docker-compose-plugin
curl -fsSL https://get.docker.com | sh
docker compose version
```

Если `docker compose version` пишет «command not found», установите плагин:

```bash
apt install -y docker-compose-plugin
# или старый вариант:
apt install -y docker-compose
```

Откройте порты в файрволе ServerSpace (если включён):

| Порт | Назначение |
|------|------------|
| 22   | SSH |
| 80   | HTTP (нужен для Let's Encrypt) |
| 443  | HTTPS |

В панели ServerSpace: **Сеть / Firewall** → разрешить входящие 80 и 443.

---

## Шаг 4. Загрузите проект на сервер

```bash
cd /opt
git clone https://github.com/egorsnaff/films.git
cd films
git checkout main   # или ветку после мержа PR с self-host

cp .env.production.example .env
nano .env
```

Заполните `.env`:

```env
FILMS_DOMAIN=films.qzz.io
CERTBOT_EMAIL=ваш@email.com

VITE_BASE_PATH=/
KINOPOISK_API_KEY=ваш-ключ
VITE_ALLOHA_TOKEN=ваш-токен

# Пока Alloha не добавит films.qzz.io в whitelist — оставьте hometv:
VITE_PLAYER_EMBED_DOMAIN=nayteruz.github.io
```

---

## Шаг 5. Запуск

```bash
chmod +x deploy/deploy.sh deploy/bootstrap-ssl.sh

# Сборка и HTTP (порт 80)
./deploy/deploy.sh

# HTTPS (Let's Encrypt) — после того как DNS указывает на сервер
./deploy/bootstrap-ssl.sh
```

Сайт: **https://films.qzz.io**

### Что делают скрипты

| Скрипт | Действие |
|--------|----------|
| `deploy/deploy.sh` | `docker compose -f docker-compose.prod.yml up -d --build` |
| `deploy/bootstrap-ssl.sh` | HTTP → certbot → HTTPS, автообновление сертификата |

---

## Nginx на хосте (films + API через один порт)

Если сайт идёт через `127.0.0.1:8080`, конфиг **без** отдельного `/api/`:

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

Контейнер `films` сам проксирует `/api/` на сервис `api`.  
Если в nginx на хосте есть `location /api/ { proxy_pass http://127.0.0.1:3001; }` — **удалите** его, иначе будет **502**.

Проверка:

```bash
curl -s http://127.0.0.1:8080/api/health
# {"ok":true}
```

---

## Шаг 6. Обновление после изменений в коде

### Вручную

```bash
cd /opt/films
./deploy/update.sh
```

### Автоматически (после мержа в `main`)

Workflow **Deploy VPS** (`.github/workflows/deploy-vps.yml`) при пуше в `main`:
1. Подключается к VPS по SSH
2. Заходит в `/opt/films`
3. Запускает `./deploy/update.sh` (pull + пересборка `api` и `films` + healthcheck)

Ниже — **полная одноразовая настройка** с проверками на каждом шаге.

---

#### Что должно уже быть на сервере

Перед автодеплоем на VPS должно работать ручное обновление:

```bash
ssh root@ВАШ_IP
cd /opt/films
ls -la .env deploy/update.sh docker-compose.yml   # всё на месте
docker-compose ps                                  # api и films в Up
curl -s http://127.0.0.1:8080/api/health           # {"ok":true}
```

Файл `.env` с токенами **остаётся только на сервере** — в GitHub Secrets его не кладём.

---

#### Шаг A. Создать SSH-ключ для GitHub Actions

На **вашем компьютере** (не на сервере):

```bash
ssh-keygen -t ed25519 -C "github-deploy-films" -f ~/.ssh/films_deploy -N ""
```

- `-N ""` — без пароля (иначе GitHub Actions не сможет использовать ключ)
- Появятся два файла:
  - `~/.ssh/films_deploy` — **приватный** → пойдёт в GitHub Secret
  - `~/.ssh/films_deploy.pub` — **публичный** → пойдёт на сервер

Проверка:

```bash
ls -la ~/.ssh/films_deploy*
# films_deploy      (права 600)
# films_deploy.pub  (права 644)
```

---

#### Шаг B. Разрешить этому ключу вход на VPS

```bash
ssh-copy-id -i ~/.ssh/films_deploy.pub root@ВАШ_IP
```

Если `ssh-copy-id` нет — вручную на сервере:

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys
# вставить одну строку из cat ~/.ssh/films_deploy.pub
chmod 600 ~/.ssh/authorized_keys
```

Проверка с ПК — вход **без пароля**:

```bash
ssh -i ~/.ssh/films_deploy root@ВАШ_IP "echo OK && hostname"
# должно вывести OK и имя сервера
```

---

#### Шаг C. Убедиться, что сервер может `git pull`

`deploy/update.sh` делает `git fetch origin main`. На сервере:

```bash
cd /opt/films
git remote -v
git fetch origin main
```

| Ситуация | Что сделать |
|----------|-------------|
| Репозиторий **публичный**, clone через HTTPS | Обычно уже работает |
| Репозиторий **приватный** | На сервере нужен [Deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys) в Settings → Deploy keys (read-only), либо PAT в URL remote |
| `git fetch` просит логин | `git remote set-url origin git@github.com:egorsnaff/films.git` + deploy key на сервере |

---

#### Шаг D. Добавить Secrets в GitHub

Откройте:  
`https://github.com/egorsnaff/films/settings/secrets/actions`  
→ **New repository secret** (по одному).

**Обязательные (3 штуки):**

| Secret | Что вставить | Пример |
|--------|--------------|--------|
| `VPS_HOST` | IP VPS или домен | `185.12.34.56` или `films.qzz.io` |
| `VPS_USER` | SSH-логин | `root` |
| `VPS_SSH_KEY` | **Весь** приватный ключ | вывод `cat ~/.ssh/films_deploy` |

Для `VPS_SSH_KEY` скопируйте **включая** строки:

```text
-----BEGIN OPENSSH PRIVATE KEY-----
...
-----END OPENSSH PRIVATE KEY-----
```

**Необязательные:**

| Secret | Когда нужен | Значение |
|--------|-------------|----------|
| `VPS_PORT` | SSH не на 22-м порту | `22` |
| `VPS_DEPLOY_PATH` | проект не в `/opt/films` | `/opt/films` |

---

#### Шаг E. Первый тест на сервере вручную

Перед GitHub Actions проверьте скрипт на VPS:

```bash
ssh root@ВАШ_IP
cd /opt/films
chmod +x deploy/update.sh
./deploy/update.sh
```

В конце должно быть:

```text
  api: ok
  films/api proxy: ok
→ Деплой завершён
```

---

#### Шаг F. Запустить workflow в GitHub

1. Убедитесь, что в `main` есть workflow (PR с автодеплоем смержен).
2. GitHub → вкладка **Actions** → **Deploy VPS**.
3. **Run workflow** → branch `main` → Run.

Зелёная галочка = деплой прошёл. Красный крестик — откройте шаг **Deploy over SSH**, там текст ошибки.

После настройки каждый **мерж в `main`** будет запускать деплой сам.

---

#### Частые ошибки автодеплоя

| Ошибка в Actions | Причина | Решение |
|------------------|---------|---------|
| `connection refused` / `timeout` | неверный IP, закрыт порт 22 | проверить `VPS_HOST`, firewall ServerSpace |
| `unable to authenticate` | неверный ключ или не в `authorized_keys` | повторить шаги A–B |
| `cd: ... No such file` | неверный путь | Secret `VPS_DEPLOY_PATH` или `git clone` в `/opt/films` |
| `git fetch` failed | сервер не тянет приватный репо | шаг C |
| `curl ... health` failed | контейнеры не поднялись | на сервере: `docker-compose logs api films` |
| `permission denied (publickey)` | в Secret попал `.pub` вместо приватного | пересоздать `VPS_SSH_KEY` из `films_deploy` |

Логи на сервере:

```bash
cd /opt/films
docker-compose ps
docker-compose logs --tail=100 api films
```

---

## Плееры после переезда

1. Сначала сайт работает на `https://films.qzz.io`, плееры — с `VITE_PLAYER_EMBED_DOMAIN=nayteruz.github.io` (как сейчас на GitHub Pages).
2. Добавьте `films.qzz.io` в whitelist Alloha (панель балансера, поле domain).
3. Пересоберите:
   ```env
   VITE_PLAYER_EMBED_DOMAIN=films.qzz.io
   ```
   ```bash
   ./deploy/deploy.sh
   ```

---

## Частые проблемы

### `dig films.qzz.io` не показывает IP VPS

- Подождите распространения DNS.
- Проверьте A-запись в панели qzz.io / Cloudflare.

### Certbot: connection refused / timeout

- Порт **80** должен быть открыт на VPS и в firewall ServerSpace.
- DNS должен уже указывать на этот IP.
- В Cloudflare временно отключите прокси (серое облако).

### Сайт открывается по IP, но не по домену

- DNS ещё не обновился или A-запись неверная.
- Проверьте `FILMS_DOMAIN=films.qzz.io` в `.env`.

### 502 Bad Gateway

```bash
cd /opt/films
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs api --tail=80
docker compose -f docker-compose.prod.yml logs films --tail=40
docker compose -f docker-compose.prod.yml logs proxy --tail=40
```

Контейнеры `api` и `films` должны быть в статусе `running`.

Если `/api/health` отвечает `{"ok":true}`, а `/api/kp/*` даёт 502:

```bash
grep KINOPOISK_API_KEY .env
curl -s http://127.0.0.1/api/health/kp
```

| Симптом | Причина | Решение |
|---------|---------|---------|
| `keyConfigured: false` | ключ не передан в контейнер `api` | добавить `KINOPOISK_API_KEY=...` в `.env`, пересобрать `api` |
| `Неверный Kinopoisk API ключ` | старый ключ в `.env` | вставить новый ключ, `docker compose -f docker-compose.prod.yml up -d --build api` |
| `api` нет в `ps` | prod-стек без API | обновить репозиторий (в `docker-compose.prod.yml` есть сервис `api`), `./deploy/update.sh` |
| `films` 502, `api` OK локально | nginx не видит `api` | `docker compose -f docker-compose.prod.yml down && docker compose -f docker-compose.prod.yml up -d --build` |

---

## Краткий чеклист

- [ ] IP VPS из my.serverspace.ru
- [ ] A-запись `films.qzz.io` → IP VPS
- [ ] `ping films.qzz.io` отвечает правильным IP
- [ ] Docker установлен на VPS
- [ ] Порты 80 и 443 открыты
- [ ] `.env` заполнен (`FILMS_DOMAIN`, `CERTBOT_EMAIL`, API-ключи)
- [ ] `./deploy/deploy.sh`
- [ ] `./deploy/bootstrap-ssl.sh`
- [ ] Открыть https://films.qzz.io
