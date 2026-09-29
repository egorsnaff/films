# Регистрация с апрувом владельца — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Люди подают заявку на доступ (email + пароль), админ (`egor`) одобряет или отклоняет её на странице `/admin` или кнопками в Telegram.

**Architecture:** Заявки живут в отдельной таблице `signup_requests`; при одобрении создаётся обычная строка `users`, поэтому код, читающий `users`, не меняется. Логика заявок — `server/src/signup.ts`, HTTP-маршруты — `server/src/signupRoutes.ts` (тестируются без запуска всего API), уведомления — новые методы в `server/src/telegramBot.ts`. На фронте: форма заявки на экране входа, новый `view: "admin"` со страницей `AdminPage`.

**Tech Stack:** Express 5, better-sqlite3, bcryptjs, vitest (сервер); React 19, Vite, vitest + Testing Library (фронт).

**Spec:** `docs/superpowers/specs/2026-09-29-signup-approval-design.md`

## Global Constraints

- Все тексты для пользователя — на русском; ошибки API — в поле `error`.
- Email хранится в нижнем регистре без пробелов по краям и становится `username`.
- Пароль — не короче 8 символов, хэш `bcrypt.hashSync(password, 12)` (как в `server/scripts/create-user.ts`).
- Не больше 20 заявок со статусом `pending` одновременно.
- Роуты бэкенда без префикса `/api`; фронт ходит через `/api/*`.
- Линтера нет: статическая проверка — `npm run build` (сервер) и `npm run build` (фронт, включает `tsc --noEmit`).
- Серверные тесты работают с реальной SQLite (`server/data/films.db`); тестовые строки создаются с уникальным префиксом и удаляются в `afterEach`/`finally`.
- Команды сервера выполнять из `server/`, фронта — из корня репозитория.

---

## Карта файлов

| Файл | Что делает |
|------|-----------|
| `server/src/db.ts` (изм.) | таблица `signup_requests`, колонка `users.is_admin`, `ensureInitialAdmins` |
| `server/src/signup.ts` (нов.) | создание заявок, список, решение, текст блокировки логина |
| `server/src/signupRoutes.ts` (нов.) | `POST /auth/signup`, `/admin/signup-requests*`, `requireAdmin` |
| `server/src/telegramBot.ts` (изм.) | уведомление админам, кнопки одобрения |
| `server/src/index.ts` (изм.) | `isAdmin` в сессии, 403 для заявок при логине, подключение роутера и бота |
| `src/lib/siteApi.ts` (изм.) | `signup`, `getSignupRequests`, `decideSignupRequest`, `AuthUser.isAdmin` |
| `src/components/SignupForm.tsx` (нов.) | форма заявки со своим состоянием |
| `src/components/AuthGateScreen.tsx` (изм.) | переключение вход / заявка |
| `src/components/AdminPage.tsx` (нов.) | страница заявок |
| `src/components/UserMenu.tsx` (изм.) | пункт «Админка» |
| `src/lib/navigation.ts`, `src/lib/appRoutes.ts` (изм.) | маршрут `/admin` |
| `src/App.tsx` (изм.) | подключение страницы и пункта меню |
| `src/styles.css` (изм.) | стили переключателя и админки |
| `docs/AUTH.md` (изм.) | документация |

---

### Task 1: Схема БД — `signup_requests` и `users.is_admin`

**Files:**
- Modify: `server/src/db.ts`
- Test: `server/src/db.test.ts`

**Interfaces:**
- Produces: `DbUser.is_admin: number` (0/1); `INITIAL_ADMINS: string[]`; `ensureInitialAdmins(usernames?: string[]): void`; таблица `signup_requests(id, email, password_hash, status, created_at, decided_at, decided_by)`.

- [ ] **Step 1: Write the failing test**

В `server/src/db.test.ts` добавить в импорт из `./db.js` имена `ensureInitialAdmins` и `findUserById`, а в конец файла:

```ts
describe("ensureInitialAdmins", () => {
  const username = "initial-admin-test";
  const cleanup = () => db.prepare("DELETE FROM users WHERE username = ?").run(username);

  it("promotes only the listed users", () => {
    cleanup();
    try {
      const user = createUser(username, "");
      expect(user.is_admin).toBe(0);

      ensureInitialAdmins(["someone-else"]);
      expect(findUserById(user.id)?.is_admin).toBe(0);

      ensureInitialAdmins([username]);
      expect(findUserById(user.id)?.is_admin).toBe(1);
    } finally {
      cleanup();
    }
  });
});

describe("signup_requests table", () => {
  it("has the expected columns", () => {
    const columns = db.prepare("PRAGMA table_info(signup_requests)").all() as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).toEqual([
      "id",
      "email",
      "password_hash",
      "status",
      "created_at",
      "decided_at",
      "decided_by"
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/db.test.ts`
Expected: FAIL — `ensureInitialAdmins` is not a function / `is_admin` undefined.

- [ ] **Step 3: Implement**

В `server/src/db.ts`:

1. Тип пользователя:

```ts
export type DbUser = {
  id: number;
  username: string;
  password_hash: string;
  created_at: string;
  is_admin: number;
};
```

2. В большой `db.exec(...)` после `app_meta` добавить:

```sql
  CREATE TABLE IF NOT EXISTS signup_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    created_at TEXT NOT NULL,
    decided_at TEXT,
    decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL
  );
```

3. После строк `ensureColumn("user_films", ...)`:

```ts
ensureColumn("users", "is_admin", "INTEGER NOT NULL DEFAULT 0");

export const INITIAL_ADMINS = ["egor"];

export function ensureInitialAdmins(usernames: string[] = INITIAL_ADMINS): void {
  const promote = db.prepare("UPDATE users SET is_admin = 1 WHERE username = ?");
  for (const username of usernames) {
    promote.run(username);
  }
}

ensureInitialAdmins();
```

4. В `createUser`, `findUserByUsername`, `findUserById` заменить список колонок `id, username, password_hash, created_at` на `id, username, password_hash, created_at, is_admin`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/db.test.ts && npm run build`
Expected: PASS, сборка без ошибок.

- [ ] **Step 5: Commit**

```bash
git add server/src/db.ts server/src/db.test.ts
git commit -m "Add signup_requests table and users.is_admin"
```

---

### Task 2: Логика заявок — `signup.ts`

**Files:**
- Create: `server/src/signup.ts`
- Test: `server/src/signup.test.ts`

**Interfaces:**
- Consumes: `db`, `createUser`, `findUserByUsername` из `./db.js`.
- Produces:
  - `type SignupRequestStatus = "pending" | "approved" | "rejected"`
  - `type SignupRequest = { id: number; email: string; status: SignupRequestStatus; createdAt: string; decidedAt: string | null }`
  - `type SignupErrorCode = "invalid_email" | "weak_password" | "already_registered" | "pending" | "rejected" | "too_many_pending"`
  - `type DecisionErrorCode = "not_found" | "already_decided"`
  - `type SignupDecision = "approve" | "reject"`
  - `type SignupResult = { ok: true; request: SignupRequest } | { ok: false; error: SignupErrorCode }`
  - `type DecisionResult = { ok: true; request: SignupRequest } | { ok: false; error: DecisionErrorCode }`
  - `MAX_PENDING_SIGNUP_REQUESTS = 20`, `MIN_PASSWORD_LENGTH = 8`
  - `normalizeEmail(value: string): string`
  - `createSignupRequest(email: string, password: string): SignupResult`
  - `findSignupRequestByEmail(email: string): SignupRequest | undefined`
  - `listSignupRequests(filter: "pending" | "decided"): SignupRequest[]`
  - `decideSignupRequest(id: number, decision: SignupDecision, adminId: number): DecisionResult`
  - `loginBlockedMessage(login: string): string | null`

- [ ] **Step 1: Write the failing test**

`server/src/signup.test.ts`:

```ts
import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db, findUserByUsername } from "./db.js";
import {
  MAX_PENDING_SIGNUP_REQUESTS,
  createSignupRequest,
  decideSignupRequest,
  findSignupRequestByEmail,
  listSignupRequests,
  loginBlockedMessage
} from "./signup.js";

const PREFIX = "signup-test-";
const ADMIN_ID = 990_500;

function cleanup() {
  db.prepare("DELETE FROM signup_requests WHERE email LIKE ?").run(`${PREFIX}%`);
  db.prepare("DELETE FROM users WHERE username LIKE ?").run(`${PREFIX}%`);
}

beforeEach(cleanup);
afterEach(cleanup);

describe("createSignupRequest", () => {
  it("rejects malformed emails", () => {
    for (const email of ["not-an-email", "a@b", `${"x".repeat(250)}@t.io`]) {
      expect(createSignupRequest(email, "password123")).toEqual({ ok: false, error: "invalid_email" });
    }
  });

  it("rejects short passwords", () => {
    expect(createSignupRequest(`${PREFIX}a@example.com`, "short")).toEqual({
      ok: false,
      error: "weak_password"
    });
  });

  it("stores a normalized email with a bcrypt hash", () => {
    const result = createSignupRequest(`  ${PREFIX.toUpperCase()}A@Example.COM `, "password123");

    expect(result).toMatchObject({
      ok: true,
      request: { email: `${PREFIX}a@example.com`, status: "pending", decidedAt: null }
    });
    const row = db
      .prepare("SELECT password_hash FROM signup_requests WHERE email = ?")
      .get(`${PREFIX}a@example.com`) as { password_hash: string };
    expect(bcrypt.compareSync("password123", row.password_hash)).toBe(true);
  });

  it("refuses a second request for the same email regardless of case", () => {
    createSignupRequest(`${PREFIX}a@example.com`, "password123");
    expect(createSignupRequest(`${PREFIX}A@EXAMPLE.com`, "password456")).toEqual({
      ok: false,
      error: "pending"
    });
  });

  it("refuses emails that already belong to a user", () => {
    db.prepare(
      "INSERT INTO users (username, password_hash, created_at) VALUES (?, '', ?)"
    ).run(`${PREFIX}b@example.com`, new Date().toISOString());

    expect(createSignupRequest(`${PREFIX}b@example.com`, "password123")).toEqual({
      ok: false,
      error: "already_registered"
    });
  });

  it("stops accepting requests when the queue is full", () => {
    const { count } = db
      .prepare("SELECT COUNT(*) AS count FROM signup_requests WHERE status = 'pending'")
      .get() as { count: number };
    const insert = db.prepare(
      "INSERT INTO signup_requests (email, password_hash, status, created_at) VALUES (?, '', 'pending', ?)"
    );
    for (let index = count; index < MAX_PENDING_SIGNUP_REQUESTS; index += 1) {
      insert.run(`${PREFIX}limit-${index}@example.com`, new Date().toISOString());
    }

    expect(createSignupRequest(`${PREFIX}over@example.com`, "password123")).toEqual({
      ok: false,
      error: "too_many_pending"
    });
  });
});

describe("decideSignupRequest", () => {
  it("approves by creating a user with the same password hash", () => {
    const created = createSignupRequest(`${PREFIX}c@example.com`, "password123");
    if (!created.ok) throw new Error("setup failed");

    const result = decideSignupRequest(created.request.id, "approve", ADMIN_ID);

    expect(result).toMatchObject({ ok: true, request: { status: "approved" } });
    expect(result.ok && result.request.decidedAt).toBeTruthy();
    const user = findUserByUsername(`${PREFIX}c@example.com`);
    expect(user?.is_admin).toBe(0);
    expect(bcrypt.compareSync("password123", user?.password_hash ?? "")).toBe(true);
    expect(decideSignupRequest(created.request.id, "reject", ADMIN_ID)).toEqual({
      ok: false,
      error: "already_decided"
    });
  });

  it("rejects without creating a user and blocks new requests from that email", () => {
    const created = createSignupRequest(`${PREFIX}d@example.com`, "password123");
    if (!created.ok) throw new Error("setup failed");

    expect(decideSignupRequest(created.request.id, "reject", ADMIN_ID)).toMatchObject({
      ok: true,
      request: { status: "rejected" }
    });
    expect(findUserByUsername(`${PREFIX}d@example.com`)).toBeUndefined();
    expect(createSignupRequest(`${PREFIX}d@example.com`, "password123")).toEqual({
      ok: false,
      error: "rejected"
    });
  });

  it("reports unknown requests", () => {
    expect(decideSignupRequest(0, "approve", ADMIN_ID)).toEqual({ ok: false, error: "not_found" });
  });
});

describe("listSignupRequests", () => {
  it("moves a request from pending to decided", () => {
    const created = createSignupRequest(`${PREFIX}e@example.com`, "password123");
    if (!created.ok) throw new Error("setup failed");
    const ids = (filter: "pending" | "decided") => listSignupRequests(filter).map((entry) => entry.id);

    expect(ids("pending")).toContain(created.request.id);
    decideSignupRequest(created.request.id, "approve", ADMIN_ID);
    expect(ids("pending")).not.toContain(created.request.id);
    expect(ids("decided")).toContain(created.request.id);
  });
});

describe("loginBlockedMessage", () => {
  it("explains pending and rejected requests", () => {
    const created = createSignupRequest(`${PREFIX}f@example.com`, "password123");
    if (!created.ok) throw new Error("setup failed");

    expect(loginBlockedMessage(`${PREFIX}F@example.com`)).toBe(
      "Заявка на рассмотрении. Попробуйте войти позже."
    );
    decideSignupRequest(created.request.id, "reject", ADMIN_ID);
    expect(loginBlockedMessage(`${PREFIX}f@example.com`)).toBe("Заявка отклонена.");
    expect(loginBlockedMessage(`${PREFIX}nobody@example.com`)).toBeNull();
    expect(findSignupRequestByEmail(`${PREFIX}f@example.com`)?.status).toBe("rejected");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/signup.test.ts`
Expected: FAIL — `Cannot find module './signup.js'`.

- [ ] **Step 3: Implement**

`server/src/signup.ts`:

```ts
import bcrypt from "bcryptjs";

import { createUser, db, findUserByUsername } from "./db.js";

export type SignupRequestStatus = "pending" | "approved" | "rejected";

export type SignupRequest = {
  id: number;
  email: string;
  status: SignupRequestStatus;
  createdAt: string;
  decidedAt: string | null;
};

export type SignupErrorCode =
  | "invalid_email"
  | "weak_password"
  | "already_registered"
  | "pending"
  | "rejected"
  | "too_many_pending";

export type DecisionErrorCode = "not_found" | "already_decided";

export type SignupDecision = "approve" | "reject";

export type SignupResult = { ok: true; request: SignupRequest } | { ok: false; error: SignupErrorCode };

export type DecisionResult =
  | { ok: true; request: SignupRequest }
  | { ok: false; error: DecisionErrorCode };

export const MAX_PENDING_SIGNUP_REQUESTS = 20;
export const MIN_PASSWORD_LENGTH = 8;
const EMAIL_MAX_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DECIDED_LIST_LIMIT = 100;

type DbSignupRequest = {
  id: number;
  email: string;
  password_hash: string;
  status: SignupRequestStatus;
  created_at: string;
  decided_at: string | null;
};

const COLUMNS = "id, email, password_hash, status, created_at, decided_at";

function toSignupRequest(row: DbSignupRequest): SignupRequest {
  return {
    id: row.id,
    email: row.email,
    status: row.status,
    createdAt: row.created_at,
    decidedAt: row.decided_at
  };
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function findRowByEmail(email: string): DbSignupRequest | undefined {
  return db
    .prepare(`SELECT ${COLUMNS} FROM signup_requests WHERE email = ?`)
    .get(normalizeEmail(email)) as DbSignupRequest | undefined;
}

function findRowById(id: number): DbSignupRequest | undefined {
  return db.prepare(`SELECT ${COLUMNS} FROM signup_requests WHERE id = ?`).get(id) as
    | DbSignupRequest
    | undefined;
}

export function findSignupRequestByEmail(email: string): SignupRequest | undefined {
  const row = findRowByEmail(email);
  return row ? toSignupRequest(row) : undefined;
}

export function createSignupRequest(rawEmail: string, password: string): SignupResult {
  const email = normalizeEmail(rawEmail);

  if (email.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "invalid_email" };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: "weak_password" };
  }
  if (findUserByUsername(email)) {
    return { ok: false, error: "already_registered" };
  }

  const existing = findRowByEmail(email);
  if (existing) {
    return {
      ok: false,
      error:
        existing.status === "rejected"
          ? "rejected"
          : existing.status === "approved"
            ? "already_registered"
            : "pending"
    };
  }

  const { count } = db
    .prepare("SELECT COUNT(*) AS count FROM signup_requests WHERE status = 'pending'")
    .get() as { count: number };
  if (count >= MAX_PENDING_SIGNUP_REQUESTS) {
    return { ok: false, error: "too_many_pending" };
  }

  const result = db
    .prepare(
      "INSERT INTO signup_requests (email, password_hash, status, created_at) VALUES (?, ?, 'pending', ?)"
    )
    .run(email, bcrypt.hashSync(password, 12), new Date().toISOString());

  return { ok: true, request: toSignupRequest(findRowById(Number(result.lastInsertRowid))!) };
}

export function listSignupRequests(filter: "pending" | "decided"): SignupRequest[] {
  const rows =
    filter === "pending"
      ? db
          .prepare(
            `SELECT ${COLUMNS} FROM signup_requests WHERE status = 'pending' ORDER BY created_at ASC, id ASC`
          )
          .all()
      : db
          .prepare(
            `SELECT ${COLUMNS} FROM signup_requests WHERE status <> 'pending'
             ORDER BY decided_at DESC, id DESC LIMIT ${DECIDED_LIST_LIMIT}`
          )
          .all();

  return (rows as DbSignupRequest[]).map(toSignupRequest);
}

const decideInTransaction = db.transaction(
  (id: number, decision: SignupDecision, adminId: number): DecisionResult => {
    const row = findRowById(id);
    if (!row) {
      return { ok: false, error: "not_found" };
    }
    if (row.status !== "pending") {
      return { ok: false, error: "already_decided" };
    }

    if (decision === "approve" && !findUserByUsername(row.email)) {
      createUser(row.email, row.password_hash);
    }

    db.prepare(
      "UPDATE signup_requests SET status = ?, decided_at = ?, decided_by = ? WHERE id = ?"
    ).run(decision === "approve" ? "approved" : "rejected", new Date().toISOString(), adminId, id);

    return { ok: true, request: toSignupRequest(findRowById(id)!) };
  }
);

export function decideSignupRequest(
  id: number,
  decision: SignupDecision,
  adminId: number
): DecisionResult {
  return decideInTransaction(id, decision, adminId);
}

export function loginBlockedMessage(login: string): string | null {
  const status = findRowByEmail(login)?.status;
  if (status === "pending") {
    return "Заявка на рассмотрении. Попробуйте войти позже.";
  }
  if (status === "rejected") {
    return "Заявка отклонена.";
  }
  return null;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/signup.test.ts && npm run build`
Expected: PASS, сборка без ошибок.

- [ ] **Step 5: Commit**

```bash
git add server/src/signup.ts server/src/signup.test.ts
git commit -m "Add signup request storage and decisions"
```

---

### Task 3: HTTP-маршруты — `signupRoutes.ts`

**Files:**
- Create: `server/src/signupRoutes.ts`
- Test: `server/src/signupRoutes.test.ts`

**Interfaces:**
- Consumes: из `./signup.js` — `createSignupRequest`, `decideSignupRequest`, `listSignupRequests`, `MIN_PASSWORD_LENGTH`, типы `SignupErrorCode`, `DecisionErrorCode`, `SignupDecision`, `SignupRequest`.
- Produces:
  - `requireAdmin: RequestHandler` — ожидает `res.locals.user` (кладёт `requireUser`), 403 если `is_admin !== 1`.
  - `type SignupRouterDeps = { requireUser: RequestHandler; onSignupRequest(request: SignupRequest): void }`
  - `createSignupRouter(deps: SignupRouterDeps): express.Router` с маршрутами:
    - `POST /auth/signup` → `201 { ok: true }` / `{ error }` с 400, 409, 429
    - `GET /admin/signup-requests?status=pending|decided` → `{ requests: SignupRequest[] }`
    - `POST /admin/signup-requests/:id/approve` и `/reject` → `{ request }` / 404 / 409

- [ ] **Step 1: Write the failing test**

`server/src/signupRoutes.test.ts`:

```ts
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import express, { type RequestHandler } from "express";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { db, findUserById, findUserByUsername } from "./db.js";
import { createSignupRouter } from "./signupRoutes.js";

const PREFIX = "routes-test-";
const onSignupRequest = vi.fn();

const requireUser: RequestHandler = (req, res, next) => {
  const user = findUserById(Number(req.header("x-test-user")));
  if (!user) {
    res.status(401).json({ error: "Требуется авторизация" });
    return;
  }
  res.locals.user = user;
  next();
};

let server: Server;
let baseUrl = "";
let adminId = 0;
let userId = 0;

function insertUser(username: string, isAdmin: boolean): number {
  const result = db
    .prepare("INSERT INTO users (username, password_hash, created_at, is_admin) VALUES (?, '', ?, ?)")
    .run(username, new Date().toISOString(), isAdmin ? 1 : 0);
  return Number(result.lastInsertRowid);
}

function removeRequestsAndCreatedUsers() {
  db.prepare("DELETE FROM signup_requests WHERE email LIKE ?").run(`${PREFIX}%`);
  db.prepare("DELETE FROM users WHERE username LIKE ? AND id NOT IN (?, ?)").run(
    `${PREFIX}%`,
    adminId,
    userId
  );
}

function call(path: string, options: { method?: string; body?: unknown; as?: number } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.as ? { "x-test-user": String(options.as) } : {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
}

async function submit(email: string) {
  return call("/auth/signup", { method: "POST", body: { email, password: "password123" } });
}

beforeAll(async () => {
  db.prepare("DELETE FROM signup_requests WHERE email LIKE ?").run(`${PREFIX}%`);
  db.prepare("DELETE FROM users WHERE username LIKE ?").run(`${PREFIX}%`);
  adminId = insertUser(`${PREFIX}admin`, true);
  userId = insertUser(`${PREFIX}user`, false);

  const app = express();
  app.use(express.json());
  app.use(createSignupRouter({ requireUser, onSignupRequest }));
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(() => {
  removeRequestsAndCreatedUsers();
  onSignupRequest.mockClear();
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.prepare("DELETE FROM users WHERE username LIKE ?").run(`${PREFIX}%`);
});

describe("POST /auth/signup", () => {
  it("creates a pending request and triggers the notification", async () => {
    const response = await submit(`${PREFIX}a@example.com`);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
    expect(onSignupRequest).toHaveBeenCalledWith(
      expect.objectContaining({ email: `${PREFIX}a@example.com`, status: "pending" })
    );
  });

  it("returns readable errors", async () => {
    const invalid = await call("/auth/signup", {
      method: "POST",
      body: { email: "nope", password: "password123" }
    });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: "Введите корректный email" });

    await submit(`${PREFIX}b@example.com`);
    const duplicate = await submit(`${PREFIX}b@example.com`);
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({ error: "Заявка с этим email уже на рассмотрении" });
    expect(onSignupRequest).toHaveBeenCalledTimes(1);
  });
});

describe("admin endpoints", () => {
  it("require an admin", async () => {
    expect((await call("/admin/signup-requests")).status).toBe(401);
    expect((await call("/admin/signup-requests", { as: userId })).status).toBe(403);

    await submit(`${PREFIX}c@example.com`);
    const response = await call("/admin/signup-requests?status=pending", { as: adminId });
    expect(response.status).toBe(200);
    const { requests } = (await response.json()) as { requests: Array<{ email: string }> };
    expect(requests.map((entry) => entry.email)).toContain(`${PREFIX}c@example.com`);
  });

  it("approve creates the user and refuses a second decision", async () => {
    await submit(`${PREFIX}d@example.com`);
    const { requests } = (await (
      await call("/admin/signup-requests", { as: adminId })
    ).json()) as { requests: Array<{ id: number; email: string }> };
    const id = requests.find((entry) => entry.email === `${PREFIX}d@example.com`)!.id;

    const approved = await call(`/admin/signup-requests/${id}/approve`, { method: "POST", as: adminId });
    expect(approved.status).toBe(200);
    expect(await approved.json()).toMatchObject({ request: { id, status: "approved" } });
    expect(findUserByUsername(`${PREFIX}d@example.com`)).toBeDefined();

    const again = await call(`/admin/signup-requests/${id}/reject`, { method: "POST", as: adminId });
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: "Заявка уже обработана" });
  });

  it("reject leaves no user and unknown ids return 404", async () => {
    await submit(`${PREFIX}e@example.com`);
    const { requests } = (await (
      await call("/admin/signup-requests", { as: adminId })
    ).json()) as { requests: Array<{ id: number; email: string }> };
    const id = requests.find((entry) => entry.email === `${PREFIX}e@example.com`)!.id;

    const rejected = await call(`/admin/signup-requests/${id}/reject`, { method: "POST", as: adminId });
    expect(await rejected.json()).toMatchObject({ request: { status: "rejected" } });
    expect(findUserByUsername(`${PREFIX}e@example.com`)).toBeUndefined();

    const missing = await call("/admin/signup-requests/999999999/approve", { method: "POST", as: adminId });
    expect(missing.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/signupRoutes.test.ts`
Expected: FAIL — `Cannot find module './signupRoutes.js'`.

- [ ] **Step 3: Implement**

`server/src/signupRoutes.ts`:

```ts
import express, { type RequestHandler } from "express";

import {
  MIN_PASSWORD_LENGTH,
  createSignupRequest,
  decideSignupRequest,
  listSignupRequests,
  type DecisionErrorCode,
  type SignupDecision,
  type SignupErrorCode,
  type SignupRequest
} from "./signup.js";

const SIGNUP_ERRORS: Record<SignupErrorCode, { status: number; message: string }> = {
  invalid_email: { status: 400, message: "Введите корректный email" },
  weak_password: {
    status: 400,
    message: `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов`
  },
  already_registered: { status: 409, message: "Этот email уже зарегистрирован — просто войдите" },
  pending: { status: 409, message: "Заявка с этим email уже на рассмотрении" },
  rejected: { status: 409, message: "Заявка с этим email отклонена" },
  too_many_pending: { status: 429, message: "Сейчас слишком много заявок, попробуйте позже" }
};

const DECISION_ERRORS: Record<DecisionErrorCode, { status: number; message: string }> = {
  not_found: { status: 404, message: "Заявка не найдена" },
  already_decided: { status: 409, message: "Заявка уже обработана" }
};

export const requireAdmin: RequestHandler = (_req, res, next) => {
  const user = res.locals.user as { is_admin?: number } | undefined;
  if (user?.is_admin !== 1) {
    res.status(403).json({ error: "Нет доступа" });
    return;
  }
  next();
};

export type SignupRouterDeps = {
  requireUser: RequestHandler;
  onSignupRequest(request: SignupRequest): void;
};

export function createSignupRouter({ requireUser, onSignupRequest }: SignupRouterDeps): express.Router {
  const router = express.Router();

  router.post("/auth/signup", (req, res) => {
    const result = createSignupRequest(
      String(req.body?.email ?? ""),
      String(req.body?.password ?? "")
    );

    if (!result.ok) {
      const { status, message } = SIGNUP_ERRORS[result.error];
      res.status(status).json({ error: message });
      return;
    }

    onSignupRequest(result.request);
    res.status(201).json({ ok: true });
  });

  router.get("/admin/signup-requests", requireUser, requireAdmin, (req, res) => {
    const filter = req.query.status === "decided" ? "decided" : "pending";
    res.json({ requests: listSignupRequests(filter) });
  });

  const decide =
    (decision: SignupDecision): RequestHandler =>
    (req, res) => {
      const id = Number(req.params.id);
      const admin = res.locals.user as { id: number };
      const result =
        Number.isSafeInteger(id) && id > 0
          ? decideSignupRequest(id, decision, admin.id)
          : ({ ok: false, error: "not_found" } as const);

      if (!result.ok) {
        const { status, message } = DECISION_ERRORS[result.error];
        res.status(status).json({ error: message });
        return;
      }

      res.json({ request: result.request });
    };

  router.post("/admin/signup-requests/:id/approve", requireUser, requireAdmin, decide("approve"));
  router.post("/admin/signup-requests/:id/reject", requireUser, requireAdmin, decide("reject"));

  return router;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/signupRoutes.test.ts && npm run build`
Expected: PASS, сборка без ошибок.

- [ ] **Step 5: Commit**

```bash
git add server/src/signupRoutes.ts server/src/signupRoutes.test.ts
git commit -m "Add signup and admin request routes"
```

---

### Task 4: Telegram — уведомление и кнопки одобрения

**Files:**
- Modify: `server/src/telegramBot.ts`
- Test: `server/src/telegramBot.test.ts`

**Interfaces:**
- Consumes: типы `DecisionResult`, `SignupDecision`, `SignupRequest` из `./signup.js` (только `import type`).
- Produces:
  - В `TelegramBotDeps`: `isAdmin(username: string): boolean; decideSignup(requestId: number, decision: SignupDecision, adminUsername: string): DecisionResult;`
  - `BotCallback` дополнен `{ kind: "signup"; decision: SignupDecision; requestId: number }`
  - `formatSignupRequestText(email: string): string`, `buildSignupKeyboard(requestId: number): InlineKeyboard`
  - `createTelegramBot(...)` возвращает `{ handleUpdate, notifySignupRequest }`
  - `type RunningTelegramBot = { stop(): void; notifySignupRequest(request: SignupRequest): Promise<void> }`; `startTelegramBot(...)` возвращает `RunningTelegramBot` (раньше — функцию остановки; других вызовов, кроме `index.ts`, нет).

- [ ] **Step 1: Write the failing test**

В `server/src/telegramBot.test.ts`:

1. В `createHarness` перед `...overrides` добавить зависимости, а в `return` — `decideSignup`:

```ts
  const decideSignup = vi.fn<TelegramBotDeps["decideSignup"]>(() => ({
    ok: true,
    request: { id: 7, email: "new@example.com", status: "approved", createdAt: "", decidedAt: "" }
  }));
```

```ts
    addToPlan,
    isAdmin: (username: string) => username === "egor",
    decideSignup,
    ...overrides
```

```ts
  return { bot, calls, addToPlan, decideSignup };
```

2. В конец файла:

```ts
describe("signup requests", () => {
  const request = {
    id: 7,
    email: "new@example.com",
    status: "pending" as const,
    createdAt: "2026-09-29T10:00:00.000Z",
    decidedAt: null
  };

  it("parses signup callbacks", () => {
    expect(parseCallbackData("signup:approve:7")).toEqual({ kind: "signup", decision: "approve", requestId: 7 });
    expect(parseCallbackData("signup:reject:7")).toEqual({ kind: "signup", decision: "reject", requestId: 7 });
    expect(parseCallbackData("signup:ban:7")).toBeNull();
    expect(parseCallbackData("signup:approve:0")).toBeNull();
  });

  it("notifies only admins, in private chats", async () => {
    const { bot, calls } = createHarness();

    await bot.notifySignupRequest(request);

    const sent = calls.filter((call) => call.method === "sendMessage");
    expect(sent).toHaveLength(1);
    expect(sent[0].payload).toMatchObject({
      chat_id: EGOR_TG,
      text: expect.stringContaining("new@example.com"),
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Одобрить", callback_data: "signup:approve:7" },
            { text: "❌ Отклонить", callback_data: "signup:reject:7" }
          ]
        ]
      }
    });
  });

  it("refuses decisions from non-admins", async () => {
    const { bot, calls, decideSignup } = createHarness();

    await bot.handleUpdate(callbackUpdate(KSENIYA_TG, "signup:approve:7"));

    expect(decideSignup).not.toHaveBeenCalled();
    expect(calls).toContainEqual({
      method: "answerCallbackQuery",
      payload: { callback_query_id: "cb", text: "Нет доступа" }
    });
  });

  it("applies the decision and replaces the buttons with the verdict", async () => {
    const { bot, calls, decideSignup } = createHarness();

    await bot.handleUpdate(callbackUpdate(EGOR_TG, "signup:approve:7"));

    expect(decideSignup).toHaveBeenCalledWith(7, "approve", "egor");
    expect(calls.find((call) => call.method === "editMessageText")?.payload).toMatchObject({
      chat_id: EGOR_TG,
      message_id: 5,
      text: expect.stringContaining("✅ Одобрено"),
      reply_markup: { inline_keyboard: [] }
    });
  });

  it("tells the admin when the request was already handled", async () => {
    const { bot, calls } = createHarness({
      decideSignup: () => ({ ok: false, error: "already_decided" })
    });

    await bot.handleUpdate(callbackUpdate(EGOR_TG, "signup:reject:7"));

    expect(calls).toContainEqual({
      method: "answerCallbackQuery",
      payload: { callback_query_id: "cb", text: "Уже обработано" }
    });
    expect(calls.some((call) => call.method === "editMessageReplyMarkup")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/telegramBot.test.ts`
Expected: FAIL — `bot.notifySignupRequest is not a function`, парсинг `signup:*` возвращает `null`.

- [ ] **Step 3: Implement**

В `server/src/telegramBot.ts`:

1. Импорт вверху:

```ts
import type { DecisionResult, SignupDecision, SignupRequest } from "./signup.js";
```

2. В `TelegramBotDeps` после `addToPlan`:

```ts
  isAdmin(username: string): boolean;
  decideSignup(requestId: number, decision: SignupDecision, adminUsername: string): DecisionResult;
```

3. `BotCallback` и начало `parseCallbackData`:

```ts
export type BotCallback =
  | { kind: "add"; kinopoiskId: number; target: string }
  | { kind: "show"; kinopoiskId: number }
  | { kind: "alts" }
  | { kind: "signup"; decision: SignupDecision; requestId: number };

export function parseCallbackData(data: string | undefined): BotCallback | null {
  if (data === "alts") {
    return { kind: "alts" };
  }

  const signup = /^signup:(approve|reject):(\d+)$/.exec(data ?? "");
  if (signup) {
    const requestId = Number(signup[2]);
    return Number.isSafeInteger(requestId) && requestId > 0
      ? { kind: "signup", decision: signup[1] as SignupDecision, requestId }
      : null;
  }
```

(остальное тело функции без изменений).

4. После `buildFilmKeyboard`:

```ts
export function formatSignupRequestText(email: string): string {
  return `🆕 Новая заявка на регистрацию\n<b>${escapeHtml(email)}</b>`;
}

export function buildSignupKeyboard(requestId: number): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: "✅ Одобрить", callback_data: `signup:approve:${requestId}` },
        { text: "❌ Отклонить", callback_data: `signup:reject:${requestId}` }
      ]
    ]
  };
}
```

5. Внутри `createTelegramBot`, перед `handleUpdate`:

```ts
  async function notifySignupRequest(request: SignupRequest) {
    for (const [telegramId, username] of telegramUsers) {
      if (!deps.isAdmin(username)) {
        continue;
      }
      await send(
        { chatId: telegramId },
        formatSignupRequestText(request.email),
        buildSignupKeyboard(request.id)
      ).catch((error: unknown) => {
        console.error("telegram bot: signup notify failed", error instanceof Error ? error.message : error);
      });
    }
  }

  // Решать может только тот, кто явно указан в TELEGRAM_USERS, — без подстановки TELEGRAM_CHAT_DEFAULT_USER.
  async function handleSignupDecision(
    callback: NonNullable<TelegramUpdate["callback_query"]>,
    decision: SignupDecision,
    requestId: number
  ) {
    const adminUsername = telegramUsers.get(callback.from.id);
    if (!adminUsername || !deps.isAdmin(adminUsername) || !callback.message) {
      await api.call("answerCallbackQuery", { callback_query_id: callback.id, text: "Нет доступа" });
      return;
    }

    const { chat, message_id: messageId } = callback.message;
    const result = deps.decideSignup(requestId, decision, adminUsername);
    if (!result.ok) {
      await api.call("answerCallbackQuery", {
        callback_query_id: callback.id,
        text: result.error === "already_decided" ? "Уже обработано" : "Заявка не найдена"
      });
      await api
        .call("editMessageReplyMarkup", {
          chat_id: chat.id,
          message_id: messageId,
          reply_markup: { inline_keyboard: [] }
        })
        .catch(() => undefined);
      return;
    }

    const verdict = decision === "approve" ? "✅ Одобрено" : "❌ Отклонено";
    await api.call("answerCallbackQuery", { callback_query_id: callback.id, text: verdict });
    await api.call("editMessageText", {
      chat_id: chat.id,
      message_id: messageId,
      text: `${formatSignupRequestText(result.request.email)}\n\n${verdict}`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [] }
    });
  }
```

6. В `handleUpdate` заменить блок от `const source = callback.message;` до проверки доступа на:

```ts
    const action = parseCallbackData(callback.data);
    if (action?.kind === "signup") {
      await handleSignupDecision(callback, action.decision, action.requestId);
      return;
    }

    const source = callback.message;
    const username = source ? resolveUsername(callback.from.id, source.chat.id) : undefined;
    if (!source || !action || !username || !isAllowedPlace(source.chat, source.message_thread_id)) {
      await api.call("answerCallbackQuery", { callback_query_id: callback.id, text: "Нет доступа" });
      return;
    }
```

7. `return { handleUpdate };` → `return { handleUpdate, notifySignupRequest };`

8. `startTelegramBot`:

```ts
export type RunningTelegramBot = {
  stop(): void;
  notifySignupRequest(request: SignupRequest): Promise<void>;
};

export function startTelegramBot(token: string, deps: Omit<TelegramBotDeps, "api">): RunningTelegramBot {
```

и в конце функции вместо `return () => { stopped = true; };`:

```ts
  return {
    stop: () => {
      stopped = true;
    },
    notifySignupRequest: bot.notifySignupRequest
  };
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/telegramBot.test.ts`
Expected: PASS (все старые и новые тесты).
`npm run build` на этом шаге упадёт в `index.ts` (нет `isAdmin`/`decideSignup` в вызове `startTelegramBot`) — это чинит Task 5; коммитить вместе с Task 5 не нужно, но сборку проверяем там.

- [ ] **Step 5: Commit**

```bash
git add server/src/telegramBot.ts server/src/telegramBot.test.ts
git commit -m "Notify admins about signup requests in Telegram"
```

---

### Task 5: Подключение в `index.ts`

**Files:**
- Modify: `server/src/index.ts`

**Interfaces:**
- Consumes: `loginBlockedMessage`, `decideSignupRequest` (Task 2); `createSignupRouter` (Task 3); `RunningTelegramBot`, новые deps бота (Task 4); `DbUser.is_admin` (Task 1).
- Produces: `/auth/me` и `/auth/login` отвечают `{ user: { id, username, isAdmin } }`; логин с заявкой → 403 с текстом `loginBlockedMessage`.

- [ ] **Step 1: Imports and helpers**

Импорты:

```ts
import {
  addUserFilmToList,
  deleteUserFilm,
  findUserById,
  findUserByUsername,
  listSharedPlanFilmIds,
  listUserFilmsAggregated,
  listUsers,
  removeUserFilmFromList,
  updateUserFilmProgress,
  type DbUser,
  type WatchStatus
} from "./db.js";
```

```ts
import { decideSignupRequest, loginBlockedMessage } from "./signup.js";
import { createSignupRouter } from "./signupRoutes.js";
import {
  parseTelegramGroup,
  parseTelegramUsers,
  startTelegramBot,
  type RunningTelegramBot
} from "./telegramBot.js";
```

После `const presence = createPresenceStore();`:

```ts
let telegramBot: RunningTelegramBot | null = null;
```

После `createToken`:

```ts
function toPublicUser(user: DbUser) {
  return { id: user.id, username: user.username, isAdmin: user.is_admin === 1 };
}
```

- [ ] **Step 2: `/auth/me` and `/auth/login`**

В `/auth/me`: `res.json({ user: toPublicUser(user) });`

В `/auth/login` заменить поиск пользователя и ветку «не найден»:

```ts
  const user = findUserByUsername(username) ?? findUserByUsername(username.toLowerCase());

  if (!user) {
    const blocked = loginBlockedMessage(username);
    res.status(blocked ? 403 : 401).json({ error: blocked ?? "Неверный логин или пароль" });
    return;
  }
```

и финальный ответ: `res.json({ user: toPublicUser(user) });`

- [ ] **Step 3: Mount the router**

Сразу после обработчика `app.post("/auth/logout", ...)`:

```ts
app.use(
  createSignupRouter({
    requireUser,
    onSignupRequest: (request) => {
      void telegramBot?.notifySignupRequest(request).catch((error: unknown) => {
        console.error("signup notify failed", error instanceof Error ? error.message : error);
      });
    }
  })
);
```

- [ ] **Step 4: Wire the bot**

В конце файла: `startTelegramBot(telegramBotToken, {` → `telegramBot = startTelegramBot(telegramBotToken, {`, и после `addToPlan: ...` добавить:

```ts
    isAdmin: (username) => findUserByUsername(username)?.is_admin === 1,
    decideSignup: (requestId, decision, adminUsername) => {
      const admin = findUserByUsername(adminUsername);
      return admin
        ? decideSignupRequest(requestId, decision, admin.id)
        : { ok: false, error: "not_found" };
    }
```

- [ ] **Step 5: Verify**

Run: `npm run build && npm test`
Expected: сборка без ошибок, все тесты PASS.

Ручная проверка (отдельная БД, чтобы не трогать dev-данные):

```bash
export DATABASE_PATH=/tmp/films-signup-smoke.db JWT_SECRET=dev COOKIE_SECURE=false PORT=3011 AUTH_GATE_ENABLED=false
rm -f "$DATABASE_PATH" && npm run create-user -- egor devpassword1 && npm run dev
```

В другом терминале:

```bash
curl -s -X POST localhost:3011/auth/signup -H 'Content-Type: application/json' -d '{"email":"New@Example.com","password":"password123"}'
# {"ok":true}
curl -s -X POST localhost:3011/auth/login -H 'Content-Type: application/json' -d '{"username":"new@example.com","password":"password123"}'
# {"error":"Заявка на рассмотрении. Попробуйте войти позже."}
curl -s -c /tmp/egor.txt -X POST localhost:3011/auth/login -H 'Content-Type: application/json' -d '{"username":"egor","password":"devpassword1"}'
# {"user":{"id":1,"username":"egor","isAdmin":true}}
curl -s -b /tmp/egor.txt localhost:3011/admin/signup-requests
curl -s -b /tmp/egor.txt -X POST localhost:3011/admin/signup-requests/1/approve
curl -s -X POST localhost:3011/auth/login -H 'Content-Type: application/json' -d '{"username":"New@Example.com","password":"password123"}'
# {"user":{"id":2,"username":"new@example.com","isAdmin":false}}
```

- [ ] **Step 6: Commit**

```bash
git add server/src/index.ts
git commit -m "Wire signup routes, admin flag and Telegram notifications into the API"
```

---

### Task 6: Фронт — форма заявки на экране входа

**Files:**
- Modify: `src/lib/siteApi.ts`
- Create: `src/components/SignupForm.tsx`
- Modify: `src/components/AuthGateScreen.tsx`
- Modify: `src/styles.css`
- Test: `src/components/AuthGateScreen.test.tsx`

**Interfaces:**
- Produces (в `siteApi.ts`):
  - `AuthUser = { id: number; username: string; isAdmin?: boolean }`
  - `type SignupRequestStatus = "pending" | "approved" | "rejected"`
  - `type SignupRequestEntry = { id: number; email: string; status: SignupRequestStatus; createdAt: string; decidedAt: string | null }`
  - `siteApi.signup(email: string, password: string): Promise<void>`
  - `siteApi.getSignupRequests(status: "pending" | "decided"): Promise<SignupRequestEntry[]>`
  - `siteApi.decideSignupRequest(id: number, decision: "approve" | "reject"): Promise<SignupRequestEntry>`
- `SignupForm({ onBackToLogin }: { onBackToLogin: () => void })`
- `AuthGateScreen` — пропсы не меняются.

- [ ] **Step 1: Write the failing test**

Заменить `src/components/AuthGateScreen.test.tsx` целиком:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthGateScreen } from "./AuthGateScreen";

function renderScreen(onSubmit = vi.fn((event) => event.preventDefault())) {
  render(
    <AuthGateScreen
      username="viewer"
      password="secret"
      error={null}
      isSubmitting={false}
      onUsernameChange={vi.fn()}
      onPasswordChange={vi.fn()}
      onSubmit={onSubmit}
    />
  );
  return { onSubmit };
}

function jsonResponse(body: unknown, status: number) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

async function fillSignup(password: string, confirm: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Подать заявку" }));
  await user.type(screen.getByLabelText("Email"), "new@example.com");
  await user.type(screen.getByLabelText("Пароль"), password);
  await user.type(screen.getByLabelText("Повторите пароль"), confirm);
  await user.click(screen.getByRole("button", { name: "Отправить заявку" }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AuthGateScreen", () => {
  it("renders login form and submits credentials", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderScreen();

    expect(screen.getByRole("heading", { name: /Войдите, чтобы открыть сеанс/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Логин или email")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Войти" }));
    expect(onSubmit).toHaveBeenCalled();
  });

  it("switches between login and signup", async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole("button", { name: "Подать заявку" }));
    expect(screen.getByRole("heading", { name: "Заявка на доступ" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Войти" }));
    expect(screen.getByRole("heading", { name: /Войдите, чтобы открыть сеанс/ })).toBeInTheDocument();
  });

  it("checks that passwords match before sending", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderScreen();

    await fillSignup("password123", "password999");

    expect(screen.getByRole("alert")).toHaveTextContent("Пароли не совпадают");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the request and confirms it", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }, 201));
    vi.stubGlobal("fetch", fetchMock);
    renderScreen();

    await fillSignup("password123", "password123");

    expect(await screen.findByRole("status")).toHaveTextContent("Заявка отправлена");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/auth/signup");
    expect(JSON.parse(String(init.body))).toEqual({ email: "new@example.com", password: "password123" });
  });

  it("shows the server error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "Заявка с этим email уже на рассмотрении" }, 409))
    );
    renderScreen();

    await fillSignup("password123", "password123");

    expect(await screen.findByRole("alert")).toHaveTextContent("Заявка с этим email уже на рассмотрении");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/AuthGateScreen.test.tsx`
Expected: FAIL — нет поля «Логин или email», нет кнопки «Подать заявку».

- [ ] **Step 3: Implement `siteApi`**

В `src/lib/siteApi.ts`:

```ts
export type AuthUser = {
  id: number;
  username: string;
  isAdmin?: boolean;
};

export type SignupRequestStatus = "pending" | "approved" | "rejected";

export type SignupRequestEntry = {
  id: number;
  email: string;
  status: SignupRequestStatus;
  createdAt: string;
  decidedAt: string | null;
};
```

В объект `siteApi` после `logout`:

```ts
  async signup(email: string, password: string): Promise<void> {
    await request<{ ok: true }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
  },

  async getSignupRequests(status: "pending" | "decided"): Promise<SignupRequestEntry[]> {
    const data = await request<{ requests: SignupRequestEntry[] }>(
      `/admin/signup-requests?status=${status}`
    );
    return data.requests;
  },

  async decideSignupRequest(
    id: number,
    decision: "approve" | "reject"
  ): Promise<SignupRequestEntry> {
    const data = await request<{ request: SignupRequestEntry }>(
      `/admin/signup-requests/${id}/${decision}`,
      { method: "POST" }
    );
    return data.request;
  },
```

- [ ] **Step 4: Implement `SignupForm`**

`src/components/SignupForm.tsx`:

```tsx
import { useState, type FormEvent } from "react";

import { siteApi } from "../lib/siteApi";

const MIN_PASSWORD_LENGTH = 8;

type SignupFormProps = {
  onBackToLogin: () => void;
};

export function SignupForm({ onBackToLogin }: SignupFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirm) {
      setError("Пароли не совпадают");
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await siteApi.signup(email, password);
      setIsSent(true);
    } catch (signupError) {
      setError(signupError instanceof Error ? signupError.message : "Не удалось отправить заявку");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isSent) {
    return (
      <div className="auth-gate__form">
        <p className="auth-gate__status" role="status">
          Заявка отправлена. Владелец рассмотрит её — попробуйте войти позже.
        </p>
        <button type="button" className="auth-gate__submit" onClick={onBackToLogin}>
          Ко входу
        </button>
      </div>
    );
  }

  return (
    <form className="auth-gate__form" onSubmit={handleSubmit}>
      <label className="auth-gate__field">
        <span>Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          disabled={isSubmitting}
          required
        />
      </label>

      <label className="auth-gate__field">
        <span>Пароль</span>
        <input
          name="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={`Не короче ${MIN_PASSWORD_LENGTH} символов`}
          minLength={MIN_PASSWORD_LENGTH}
          disabled={isSubmitting}
          required
        />
      </label>

      <label className="auth-gate__field">
        <span>Повторите пароль</span>
        <input
          name="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          placeholder="••••••••"
          disabled={isSubmitting}
          required
        />
      </label>

      {error ? (
        <p className="auth-gate__error" role="alert">
          {error}
        </p>
      ) : null}

      <button type="submit" className="auth-gate__submit" disabled={isSubmitting}>
        {isSubmitting ? "Отправляем..." : "Отправить заявку"}
      </button>
    </form>
  );
}
```

- [ ] **Step 5: Update `AuthGateScreen`**

В `src/components/AuthGateScreen.tsx`:

1. Импорты:

```tsx
import { useState, type FormEvent } from "react";

import { BrandMark } from "./BrandMark";
import { SignupForm } from "./SignupForm";
```

2. В начале тела компонента:

```tsx
  const [mode, setMode] = useState<"login" | "signup">("login");
  const isSignup = mode === "signup";
```

3. Заголовок и лид:

```tsx
          <h1 id="auth-gate-title" className="auth-gate__title">
            {isSignup ? "Заявка на доступ" : "Войдите, чтобы открыть сеанс"}
          </h1>
          <p className="auth-gate__lead">
            {isSignup
              ? "Оставьте email и пароль. Когда владелец одобрит заявку, войдите с ними на этой странице."
              : "Каталог и просмотр доступны только участникам. Войдите по логину или email либо подайте заявку на доступ."}
          </p>
```

4. Форму входа обернуть: `{isSignup ? <SignupForm onBackToLogin={() => setMode("login")} /> : (<form ...> ... </form>)}`. В форме входа подпись `<span>Логин</span>` → `<span>Логин или email</span>`, `placeholder="Ваш логин"` → `placeholder="Логин или email"`.

5. Сноску заменить на:

```tsx
        <p className="auth-gate__footnote">
          {isSignup ? "Уже есть доступ? " : "Нет доступа? "}
          <button
            type="button"
            className="auth-gate__switch"
            onClick={() => setMode(isSignup ? "login" : "signup")}
          >
            {isSignup ? "Войти" : "Подать заявку"}
          </button>
        </p>
```

- [ ] **Step 6: Styles**

В `src/styles.css` сразу после блока `.auth-gate__footnote { ... }`:

```css
.auth-gate__switch {
  padding: 0;
  border: 0;
  background: none;
  color: var(--gold);
  cursor: pointer;
  font: inherit;
  font-weight: 700;
}

.auth-gate__switch:hover,
.auth-gate__switch:focus-visible {
  text-decoration: underline;
}
```

- [ ] **Step 7: Run tests**

Run: `npx vitest run src/components/AuthGateScreen.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/siteApi.ts src/components/SignupForm.tsx src/components/AuthGateScreen.tsx src/components/AuthGateScreen.test.tsx src/styles.css
git commit -m "Let visitors request access from the login screen"
```

---

### Task 7: Фронт — страница `/admin` и пункт меню

**Files:**
- Modify: `src/lib/navigation.ts`, `src/lib/appRoutes.ts`
- Test: `src/lib/appRoutes.test.ts`
- Create: `src/components/AdminPage.tsx`
- Test: `src/components/AdminPage.test.tsx`
- Modify: `src/components/UserMenu.tsx`
- Test: `src/components/UserMenu.test.tsx` (новый)
- Modify: `src/App.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: `siteApi.getSignupRequests`, `siteApi.decideSignupRequest`, `SignupRequestEntry`, `AuthUser.isAdmin` (Task 6).
- Produces: `ViewState` включает `"admin"`; путь `/admin`; `AdminPage({ isAdmin: boolean; onBack: () => void })`; `UserMenu` получает необязательные `isAdmin?: boolean; onAdmin?: () => void`.

- [ ] **Step 1: Write the failing tests**

В `src/lib/appRoutes.test.ts` внутрь `describe("appRoutes", ...)`:

```ts
  it("builds and parses the admin page", () => {
    const snapshot = { ...createHomeSnapshot(), view: "admin" as const, activeMenu: "Профиль" as const };

    expect(buildAppUrl(snapshot, BASE)).toBe("/films/admin");
    expect(parseLocationToSnapshot({ pathname: "/films/admin", search: "" }, BASE)).toMatchObject({
      view: "admin",
      activeMenu: "Профиль"
    });
  });
```

`src/components/AdminPage.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminPage } from "./AdminPage";

const pending = {
  id: 1,
  email: "new@example.com",
  status: "pending",
  createdAt: "2026-09-29T10:00:00.000Z",
  decidedAt: null
};

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AdminPage", () => {
  it("shows no access to regular users without calling the API", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminPage isAdmin={false} onBack={vi.fn()} />);

    expect(screen.getByText("Нет доступа")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lists pending requests and approves one", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith("/approve")
        ? jsonResponse({ request: { ...pending, status: "approved" } })
        : jsonResponse({ requests: [pending] })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminPage isAdmin onBack={vi.fn()} />);

    expect(await screen.findByText("new@example.com")).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/signup-requests?status=pending");

    await user.click(screen.getByRole("button", { name: "Одобрить" }));

    await waitFor(() => expect(screen.queryByText("new@example.com")).not.toBeInTheDocument());
    const [url, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe("/api/admin/signup-requests/1/approve");
    expect(init.method).toBe("POST");
  });

  it("loads decided requests on the second tab", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("status=decided")
        ? jsonResponse({
            requests: [{ ...pending, status: "rejected", decidedAt: "2026-09-29T11:00:00.000Z" }]
          })
        : jsonResponse({ requests: [] })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminPage isAdmin onBack={vi.fn()} />);
    expect(await screen.findByText("Новых заявок нет.")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Обработанные" }));

    expect(await screen.findByText(/Отклонена/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Одобрить" })).not.toBeInTheDocument();
  });
});
```

`src/components/UserMenu.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { UserMenu } from "./UserMenu";

function renderMenu(isAdmin: boolean, onAdmin = vi.fn()) {
  render(
    <UserMenu
      isAuthenticated
      isAdmin={isAdmin}
      onLogin={vi.fn()}
      onProfile={vi.fn()}
      onAdmin={onAdmin}
      onLogout={vi.fn()}
    />
  );
  return { onAdmin };
}

describe("UserMenu", () => {
  it("shows the admin item only to admins", async () => {
    const user = userEvent.setup();
    const { onAdmin } = renderMenu(true);

    await user.click(screen.getByRole("button", { name: "Меню пользователя" }));
    await user.click(screen.getByRole("menuitem", { name: "Админка" }));

    expect(onAdmin).toHaveBeenCalled();
  });

  it("hides the admin item from regular users", async () => {
    const user = userEvent.setup();
    renderMenu(false);

    await user.click(screen.getByRole("button", { name: "Меню пользователя" }));

    expect(screen.queryByRole("menuitem", { name: "Админка" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/appRoutes.test.ts src/components/AdminPage.test.tsx src/components/UserMenu.test.tsx`
Expected: FAIL — нет `./AdminPage`, маршрут `/films/admin` разбирается как главная, нет пункта «Админка».

- [ ] **Step 3: Routes**

`src/lib/navigation.ts`:

```ts
export type ViewState =
  | "catalog"
  | "watch"
  | "collections"
  | "collection"
  | "profile"
  | "browse"
  | "admin";
```

`src/lib/appRoutes.ts`, в `buildAppPathname` после ветки `profile`:

```ts
  if (snapshot.view === "admin") {
    return joinAppPath(basePath, "admin");
  }
```

В `parseLocationToSnapshot` перед финальным `return { ...createHomeSnapshot(), ... }`:

```ts
  if (segments[0] === "admin") {
    return {
      ...createHomeSnapshot(),
      view: "admin",
      activeMenu: "Профиль",
      catalogMode: "premieres",
      page: 1
    };
  }
```

- [ ] **Step 4: `AdminPage`**

`src/components/AdminPage.tsx`:

```tsx
import { useEffect, useState } from "react";

import { siteApi, type SignupRequestEntry } from "../lib/siteApi";
import { BackButton } from "./BackButton";

type AdminTab = "pending" | "decided";

type AdminPageProps = {
  isAdmin: boolean;
  onBack: () => void;
};

const TAB_LABELS: Record<AdminTab, string> = {
  pending: "Ожидают",
  decided: "Обработанные"
};

const STATUS_LABELS: Record<SignupRequestEntry["status"], string> = {
  pending: "Ожидает",
  approved: "Одобрена",
  rejected: "Отклонена"
};

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }) : "";
}

export function AdminPage({ isAdmin, onBack }: AdminPageProps) {
  const [tab, setTab] = useState<AdminTab>("pending");
  const [requests, setRequests] = useState<SignupRequestEntry[]>([]);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    let cancelled = false;
    setRequests([]);
    setStatus("loading");
    setError(null);
    siteApi.getSignupRequests(tab).then(
      (items) => {
        if (!cancelled) {
          setRequests(items);
          setStatus("success");
        }
      },
      (loadError: unknown) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить заявки");
          setStatus("error");
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, [isAdmin, tab]);

  async function decide(id: number, decision: "approve" | "reject") {
    setBusyId(id);
    setError(null);
    try {
      await siteApi.decideSignupRequest(id, decision);
      setRequests((current) => current.filter((entry) => entry.id !== id));
    } catch (decideError) {
      setError(decideError instanceof Error ? decideError.message : "Не удалось обработать заявку");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="admin-page" id="main">
      <BackButton label="В кабинет" onClick={onBack} />
      <div className="section-heading">
        <h1>Заявки на регистрацию</h1>
      </div>

      {!isAdmin ? (
        <div className="empty-state">
          <strong>Нет доступа</strong>
        </div>
      ) : (
        <>
          <div className="admin-page__tabs" role="tablist">
            {(Object.keys(TAB_LABELS) as AdminTab[]).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className="admin-page__tab"
                onClick={() => setTab(key)}
              >
                {TAB_LABELS[key]}
              </button>
            ))}
          </div>

          {error ? (
            <p className="error-message" role="alert">
              {error}
            </p>
          ) : null}

          {status === "loading" ? <p className="admin-page__hint">Загружаем…</p> : null}

          {status === "success" && requests.length === 0 ? (
            <div className="empty-state">
              <strong>{tab === "pending" ? "Новых заявок нет." : "Обработанных заявок пока нет."}</strong>
            </div>
          ) : null}

          {requests.length > 0 ? (
            <ul className="admin-page__list">
              {requests.map((request) => (
                <li key={request.id} className="admin-page__row">
                  <div className="admin-page__info">
                    <strong>{request.email}</strong>
                    <span>
                      {tab === "pending"
                        ? formatDate(request.createdAt)
                        : `${STATUS_LABELS[request.status]} · ${formatDate(request.decidedAt)}`}
                    </span>
                  </div>
                  {tab === "pending" ? (
                    <div className="admin-page__actions">
                      <button
                        type="button"
                        className="admin-page__approve"
                        disabled={busyId === request.id}
                        onClick={() => void decide(request.id, "approve")}
                      >
                        Одобрить
                      </button>
                      <button
                        type="button"
                        className="admin-page__reject"
                        disabled={busyId === request.id}
                        onClick={() => void decide(request.id, "reject")}
                      >
                        Отклонить
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 5: `UserMenu`**

В `src/components/UserMenu.tsx`:

```tsx
type UserMenuProps = {
  isAuthenticated: boolean;
  isAdmin?: boolean;
  onLogin: () => void;
  onProfile: () => void;
  onAdmin?: () => void;
  onLogout: () => void;
};

export function UserMenu({ isAuthenticated, isAdmin, onLogin, onProfile, onAdmin, onLogout }: UserMenuProps) {
```

Между кнопками «Кабинет» и «Выйти»:

```tsx
          {isAdmin && onAdmin ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setIsOpen(false);
                onAdmin();
              }}
            >
              Админка
            </button>
          ) : null}
```

- [ ] **Step 6: `App.tsx`**

1. Импорт: `import { AdminPage } from "./components/AdminPage";`
2. В восстановлении снимка истории перед `} else if (snapshot.view === "browse") {`:

```tsx
      } else if (snapshot.view === "admin") {
        setView("admin");
        setSelectedFilm(null);
        setDetailsStatus("idle");
```

3. После функции `openProfileList`:

```tsx
  function openAdmin() {
    beginHistoryEntry(true);
    setView("admin");
    setActiveMenu("Профиль");
    setSelectedFilm(null);
    setWatchPreviewFilm(null);
    setDetailsStatus("idle");
    setIsSearchOpen(false);
    requestHistoryCommit(true);
    window.scrollTo({ top: 0, behavior: "auto" });
  }
```

4. В `<UserMenu ... />` добавить `isAdmin={Boolean(authUser?.isAdmin)}` и `onAdmin={openAdmin}`.
5. Перед `{view === "profile" && profileList ? (`:

```tsx
      {view === "admin" ? (
        <AdminPage
          isAdmin={Boolean(authUser?.isAdmin)}
          onBack={() => void handleMenuClick("Профиль")}
        />
      ) : null}
```

- [ ] **Step 7: Styles**

В `src/styles.css` после блока `.profile-list-view { ... }`:

```css
.admin-page {
  display: grid;
  gap: 22px;
  padding-top: 12px;
}

.admin-page__tabs {
  display: flex;
  gap: 8px;
}

.admin-page__tab {
  padding: 8px 16px;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font: inherit;
  font-weight: 600;
}

.admin-page__tab[aria-selected="true"] {
  border-color: rgb(240 183 91 / 48%);
  background: rgb(240 183 91 / 10%);
  color: var(--ink);
}

.admin-page__hint {
  margin: 0;
  color: var(--muted);
}

.admin-page__list {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.admin-page__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 18px;
  background: rgb(255 255 255 / 4%);
}

.admin-page__info {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.admin-page__info strong {
  overflow-wrap: anywhere;
}

.admin-page__info span {
  color: var(--muted);
  font-size: 0.86rem;
}

.admin-page__actions {
  display: flex;
  gap: 8px;
}

.admin-page__approve,
.admin-page__reject {
  min-height: 40px;
  padding: 0 16px;
  border-radius: 12px;
  cursor: pointer;
  font: inherit;
  font-weight: 700;
}

.admin-page__approve {
  border: 0;
  background: linear-gradient(135deg, #f0b75b, #f06b42);
  color: #150c07;
}

.admin-page__reject {
  border: 1px solid rgb(255 255 255 / 16%);
  background: transparent;
  color: var(--ink);
}

.admin-page__approve:disabled,
.admin-page__reject:disabled {
  opacity: 0.6;
  cursor: wait;
}
```

- [ ] **Step 8: Run tests and build**

Run: `npx vitest run src/lib/appRoutes.test.ts src/components/AdminPage.test.tsx src/components/UserMenu.test.tsx && npm test && npm run build`
Expected: всё PASS, сборка без ошибок.

- [ ] **Step 9: Commit**

```bash
git add src/lib/navigation.ts src/lib/appRoutes.ts src/lib/appRoutes.test.ts src/components/AdminPage.tsx src/components/AdminPage.test.tsx src/components/UserMenu.tsx src/components/UserMenu.test.tsx src/App.tsx src/styles.css
git commit -m "Add admin page for signup requests"
```

---

### Task 8: Документация и сквозная проверка

**Files:**
- Modify: `docs/AUTH.md`

- [ ] **Step 1: Update docs**

В `docs/AUTH.md` строку

```
- Публичной регистрации **нет** — пользователей добавляете только вы на сервере.
```

заменить на

```
- Регистрация — по заявке: на экране входа «Подать заявку» (email + пароль). Войти можно только после одобрения админом, см. «Заявки на регистрацию». Пользователей по-прежнему можно создать вручную на сервере.
```

Перед разделом `## Создать пользователя на сервере` вставить:

```markdown
## Заявки на регистрацию

- Заявку подают на экране входа: email + пароль (не короче 8 символов). Email становится логином; входить можно по нему в любом регистре.
- Пока заявка не одобрена, при входе показывается «Заявка на рассмотрении», после отказа — «Заявка отклонена». Повторно подать заявку с отклонённым email нельзя.
- В очереди одновременно не больше 20 ожидающих заявок, дальше форма отвечает «попробуйте позже».
- Админ одобряет или отклоняет заявки на странице `/admin` (пункт «Админка» в меню профиля) или кнопками в Telegram.
- Telegram: о каждой заявке бот пишет в личку админам, чей логин указан в `TELEGRAM_USERS`. Если бот не настроен, заявки видны только в админке.
- Админ — пользователь с `users.is_admin = 1`. При старте API флаг выставляется пользователям из `INITIAL_ADMINS` в `server/src/db.ts` (сейчас `egor`). Выдать вручную:

  ```bash
  sqlite3 /path/to/films.db "UPDATE users SET is_admin = 1 WHERE username = 'login'"
  ```
```

- [ ] **Step 2: Full verification**

```bash
cd server && npm run build && npm test && cd .. && npm run build && npm test
```

Expected: обе сборки без ошибок, все тесты PASS.

- [ ] **Step 3: Manual end-to-end**

Терминал 1 (API с отдельной БД):

```bash
cd server
export DATABASE_PATH=/tmp/films-signup-e2e.db JWT_SECRET=dev COOKIE_SECURE=false PORT=3001 CORS_ORIGIN=http://localhost:5173
export KINOPOISK_API_KEY=<ключ из .env.example>
rm -f "$DATABASE_PATH" && npm run create-user -- egor devpassword1 && npm run dev
```

Терминал 2: `npm run dev`, открыть `http://localhost:5173/films/`.

Проверить:
1. «Подать заявку» → email + пароль → «Заявка отправлена».
2. Вход с этим email → «Заявка на рассмотрении…».
3. Вход `egor` / `devpassword1` → меню профиля → «Админка» → заявка в «Ожидают» → «Одобрить» → строка исчезла, во «Обработанные» — «Одобрена».
4. Выйти, войти с email заявки → каталог открылся, пункта «Админка» в меню нет.

- [ ] **Step 4: Commit**

```bash
git add docs/AUTH.md
git commit -m "Document signup requests and admin approval"
```
