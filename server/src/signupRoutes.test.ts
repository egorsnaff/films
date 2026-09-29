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
