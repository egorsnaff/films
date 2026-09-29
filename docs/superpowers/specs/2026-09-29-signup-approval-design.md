# Регистрация с апрувом владельца (issue #71)

## Цель

Дать людям самим подать заявку на доступ (email + пароль), а владельцу — одобрять или отклонять заявки из Telegram или с отдельной админ-страницы. Сейчас пользователей создают только через `npm run create-user`.

## Решения

- Email — единственный идентификатор при регистрации; после одобрения он становится `username`. Писем не отправляем (SMTP не нужен).
- Уведомление о новой заявке — сообщение в Telegram админам с кнопками «Одобрить» / «Отклонить».
- Админские права — флаг `users.is_admin`. Первый и пока единственный админ — существующий пользователь `egor`.
- Админ-страница только для заявок (без управления пользователями).
- Ожидающий или отклонённый пользователь при входе видит статус заявки. Отклонённый email повторно подать заявку не может.
- Заявки хранятся в отдельной таблице `signup_requests`; `users` по-прежнему содержит только активные аккаунты, поэтому `listUsers`, presence, общий список, бот и `requireUser` не меняются.

## Данные (`server/src/db.ts`)

```sql
CREATE TABLE IF NOT EXISTS signup_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,          -- в нижнем регистре, без пробелов по краям
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);
```

- Миграция: `ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0` (если колонки нет), затем `UPDATE users SET is_admin = 1 WHERE username = 'egor'`. Миграция идемпотентна.
- `findUserById` / `findUserByUsername` возвращают `is_admin`.

## Логика заявок (`server/src/signup.ts`)

Модуль без Express, работает с общим `db` из `db.ts` (как остальные функции БД); экспортирует:

- `createSignupRequest(email, password)` → `{ ok: true, request }` или ошибка с кодом:
  - `invalid_email` — не похоже на email (простая проверка `x@y.z`, не длиннее 254 символов);
  - `weak_password` — короче 8 символов;
  - `already_registered` — email уже есть в `users.username`;
  - `pending` / `rejected` — заявка с таким email уже существует;
  - `too_many_pending` — в очереди 20 и более заявок со статусом `pending`.
  Пароль хэшируется `bcrypt` так же, как в `create-user`.
- `findSignupRequestByEmail(email)`.
- `listSignupRequests(status: "pending" | "decided")` — `pending` по возрастанию даты, обработанные (`approved` + `rejected`) по убыванию `decided_at`.
- `decideSignupRequest(id, decision: "approve" | "reject", adminId)` — одна транзакция. `approve` создаёт `users` (username = email, тот же `password_hash`, `is_admin = 0`; если такой логин уже есть — пользователя не создаёт) и ставит `status = 'approved'`; `reject` — только `status = 'rejected'`. В обоих случаях пишет `decided_at`, `decided_by`. Ошибки: `not_found`, `already_decided`.
- `loginBlockedMessage(login)` — текст 403 для логина с ожидающей / отклонённой заявкой, иначе `null`.

## API (`server/src/signupRoutes.ts` + `server/src/index.ts`)

`/auth/signup` и `/admin/*` живут в `createSignupRouter(...)` (отдельный модуль, чтобы тестировать без запуска всего сервера: `index.ts` при импорте поднимает `listen`). Логин и `/auth/me` остаются в `index.ts`.

| Метод | Путь | Доступ | Ответ |
|-------|------|--------|-------|
| POST | `/auth/signup` | публичный | `201 { ok: true }`; 400 (`invalid_email`, `weak_password`), 409 (`already_registered`, `pending`, `rejected`), 429 (`too_many_pending`) |
| POST | `/auth/login` | публичный | как сейчас + `isAdmin`; если пользователя нет, но есть заявка: 403 «Заявка на рассмотрении» / «Заявка отклонена» |
| GET | `/auth/me` | сессия | `{ user: { id, username, isAdmin } }` |
| GET | `/admin/signup-requests?status=pending\|decided` | админ | `{ requests: [{ id, email, status, createdAt, decidedAt }] }` |
| POST | `/admin/signup-requests/:id/approve` | админ | `200 { request }`; 404, 409 если уже обработана |
| POST | `/admin/signup-requests/:id/reject` | админ | `200 { request }`; 404, 409 |

- Тексты ошибок на русском, как у существующих эндпоинтов, в поле `error`.
- Статус заявки при логине сообщается без проверки пароля (пароль у заявки не сверяется) — это раскрывает только факт существования заявки, что допустимо для закрытого сайта на двоих-троих.
- `requireAdmin` = `requireUser` + проверка `is_admin` по БД (не по JWT), иначе 403.
- `/auth/signup` не попадает под auth gate (как `/auth/login`).
- После успешного `createSignupRequest` вызывается `telegramBot?.notifySignupRequest(request)` без `await`; ошибка отправки логируется и не влияет на ответ.

## Telegram (`server/src/telegramBot.ts`)

- В `TelegramBotDeps` добавляются: `isAdmin(username): boolean`, `decideSignup(id, decision, adminUsername)` (обёртка над `decideSignupRequest`, возвращает тот же результат).
- `notifySignupRequest(request)`: для каждого `[telegramId, username]` из `TELEGRAM_USERS`, где `isAdmin(username)`, шлёт в личку:
  «Новая заявка на регистрацию: `<email>`» (время видно у самого сообщения), клавиатура `✅ Одобрить` (`signup:approve:<id>`) и `❌ Отклонить` (`signup:reject:<id>`). В группу не шлёт.
- `parseCallbackData` понимает `signup:approve:<id>` / `signup:reject:<id>` → `{ kind: "signup", action, requestId }`.
- Обработка нажатия: username нажавшего берётся только из `TELEGRAM_USERS` (не `TELEGRAM_CHAT_DEFAULT_USER`); если его нет или `!isAdmin` — `answerCallbackQuery` «Нет доступа». Иначе вызывается approve/reject; при успехе — `editMessageText` с исходным текстом + «✅ Одобрено» / «❌ Отклонено» без клавиатуры; при `already_decided` — ответ «Уже обработано» и снятие клавиатуры.
- Если `TELEGRAM_BOT_TOKEN` не задан, бот не стартует и уведомлений нет; регистрация работает, заявки видны на админ-странице.

## Фронтенд

- `AuthGateScreen`: переключатель «Войти» / «Зарегистрироваться». Форма регистрации: email, пароль, повтор пароля (несовпадение проверяется на клиенте). После `201` форма заменяется текстом «Заявка отправлена. Владелец рассмотрит её — попробуйте войти позже.» Подпись поля входа — «Логин или email». Сноска «Нет доступа? Обратитесь к администратору сайта.» заменяется ссылкой на регистрацию.
- Тип пользователя на фронте получает `isAdmin`.
- Маршрут: новый `view: "admin"` в `src/lib/appRoutes.ts`, путь `/admin`.
- `src/components/AdminPage.tsx`: вкладки «Ожидают» / «Обработанные»; строка — email, дата, статус (для обработанных) и кнопки «Одобрить» / «Отклонить» (для ожидающих). Во время запроса кнопки строки заблокированы, после успеха строка уходит из «Ожидают». Ошибка показывается над списком. Не-админ видит «Нет доступа».
- `src/lib/siteApi.ts`: `signup`, `getSignupRequests`, `decideSignupRequest` рядом с остальными вызовами (общий хелпер `request`).
- `UserMenu.tsx`: пункт «Админка» только при `isAdmin`.

## Тесты

- `server/src/signup.test.ts`: валидация, уникальность против `users` и `signup_requests` (регистр email не важен), лимит 20, approve создаёт пользователя с тем же хэшем, повторный approve/reject → `already_decided`.
- `server/src/db.test.ts`: миграция `is_admin` и выставление для `egor`.
- `server/src/signupRoutes.test.ts`: express-приложение с роутером на случайном порту + `fetch`: `/auth/signup`, `requireAdmin` (401 / 403 / 200), approve/reject. Текст ошибки логина для заявки проверяется через `loginBlockedMessage` в `signup.test.ts`.
- `server/src/telegramBot.test.ts`: парсинг `signup:*`, уведомление уходит только админам, «Нет доступа» не-админу, редактирование сообщения, «Уже обработано».
- Фронт: переключение вход/регистрация, экран «Заявка отправлена», несовпадение паролей, `AdminPage` с замоканным fetch, пункт «Админка» в `UserMenu` только для админа.

## Документация

`docs/AUTH.md`: убрать «Публичной регистрации нет», описать заявки, админку, уведомления в Telegram и то, что админ задаётся флагом `is_admin` (сейчас — `egor`).

## Вне рамок

Письма пользователям, подтверждение email, управление пользователями и выдача админки через UI, сброс пароля, счётчик заявок в шапке.
