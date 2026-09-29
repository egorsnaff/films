import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createUser, db, findUserByUsername } from "./db.js";
import {
  MAX_PENDING_SIGNUP_REQUESTS,
  createSignupRequest,
  decideSignupRequest,
  findSignupRequestByEmail,
  listSignupRequests,
  loginBlockedMessage
} from "./signup.js";

const PREFIX = "signup-test-";
let ADMIN_ID = 0;

function cleanup() {
  db.prepare("DELETE FROM signup_requests WHERE email LIKE ?").run(`${PREFIX}%`);
  db.prepare("DELETE FROM users WHERE username LIKE ?").run(`${PREFIX}%`);
}

beforeEach(() => {
  cleanup();
  ADMIN_ID = createUser(`${PREFIX}admin`, "").id;
});
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
