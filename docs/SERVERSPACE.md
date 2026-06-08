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
apt update && apt install -y git curl gettext-base
curl -fsSL https://get.docker.com | sh
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
VITE_KINOPOISK_API_KEY=ваш-ключ
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

## Шаг 6. Обновление после изменений в коде

На сервере:

```bash
cd /opt/films
git pull
./deploy/deploy.sh
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
docker compose -f docker-compose.prod.yml logs films
docker compose -f docker-compose.prod.yml logs proxy
```

Контейнер `films` должен быть в статусе `running`.

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
