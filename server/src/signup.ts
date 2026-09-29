import bcrypt from "bcryptjs";

import { createUser, db } from "./db.js";

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

function usernameTaken(email: string): boolean {
  return Boolean(
    db.prepare("SELECT 1 FROM users WHERE lower(username) = ? LIMIT 1").get(normalizeEmail(email))
  );
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
  if (usernameTaken(email)) {
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

    if (decision === "approve" && !usernameTaken(row.email)) {
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
