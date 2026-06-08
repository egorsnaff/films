import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

export type WatchStatus = "watching" | "plan" | "waiting" | "watched";

export type DbUser = {
  id: number;
  username: string;
  password_hash: string;
  created_at: string;
};

export type DbUserFilm = {
  user_id: number;
  kinopoisk_id: number;
  status: WatchStatus;
  watch_seconds: number;
  progress_percent: number;
  updated_at: string;
};

const databasePath = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "films.db");

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

export const db = new Database(databasePath);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_films (
    user_id INTEGER NOT NULL,
    kinopoisk_id INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('watching', 'plan', 'waiting', 'watched')),
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, kinopoisk_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

function ensureColumn(table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn("user_films", "watch_seconds", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("user_films", "progress_percent", "REAL NOT NULL DEFAULT 0");

export function createUser(username: string, passwordHash: string): DbUser {
  const createdAt = new Date().toISOString();
  const result = db
    .prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)")
    .run(username, passwordHash, createdAt);

  return db
    .prepare("SELECT id, username, password_hash, created_at FROM users WHERE id = ?")
    .get(result.lastInsertRowid) as DbUser;
}

export function findUserByUsername(username: string): DbUser | undefined {
  return db
    .prepare("SELECT id, username, password_hash, created_at FROM users WHERE username = ?")
    .get(username) as DbUser | undefined;
}

export function findUserById(id: number): DbUser | undefined {
  return db
    .prepare("SELECT id, username, password_hash, created_at FROM users WHERE id = ?")
    .get(id) as DbUser | undefined;
}

export function listUserFilms(userId: number): DbUserFilm[] {
  return db
    .prepare(
      `SELECT user_id, kinopoisk_id, status, watch_seconds, progress_percent, updated_at
       FROM user_films WHERE user_id = ? ORDER BY updated_at DESC`
    )
    .all(userId) as DbUserFilm[];
}

export function upsertUserFilm(userId: number, kinopoiskId: number, status: WatchStatus): DbUserFilm {
  const updatedAt = new Date().toISOString();

  db.prepare(
    `INSERT INTO user_films (user_id, kinopoisk_id, status, watch_seconds, progress_percent, updated_at)
     VALUES (?, ?, ?, 0, 0, ?)
     ON CONFLICT(user_id, kinopoisk_id) DO UPDATE SET
       status = excluded.status,
       updated_at = excluded.updated_at`
  ).run(userId, kinopoiskId, status, updatedAt);

  return getUserFilm(userId, kinopoiskId)!;
}

export function updateUserFilmProgress(
  userId: number,
  kinopoiskId: number,
  watchSeconds: number,
  progressPercent: number,
  forceStatus?: WatchStatus
): DbUserFilm {
  const updatedAt = new Date().toISOString();
  const existing = getUserFilm(userId, kinopoiskId);
  let nextStatus: WatchStatus =
    forceStatus ?? existing?.status ?? (progressPercent >= 90 ? "watched" : "watching");

  if (!forceStatus && existing?.status === "plan") {
    nextStatus = progressPercent >= 90 ? "watched" : "watching";
  }

  if (!forceStatus && existing?.status === "waiting") {
    nextStatus = progressPercent >= 90 ? "watched" : "watching";
  }

  if (progressPercent >= 90) {
    nextStatus = "watched";
  }

  db.prepare(
    `INSERT INTO user_films (user_id, kinopoisk_id, status, watch_seconds, progress_percent, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, kinopoisk_id) DO UPDATE SET
       status = excluded.status,
       watch_seconds = MAX(user_films.watch_seconds, excluded.watch_seconds),
       progress_percent = MAX(user_films.progress_percent, excluded.progress_percent),
       updated_at = excluded.updated_at`
  ).run(userId, kinopoiskId, nextStatus, watchSeconds, progressPercent, updatedAt);

  return getUserFilm(userId, kinopoiskId)!;
}

function getUserFilm(userId: number, kinopoiskId: number): DbUserFilm | undefined {
  return db
    .prepare(
      `SELECT user_id, kinopoisk_id, status, watch_seconds, progress_percent, updated_at
       FROM user_films WHERE user_id = ? AND kinopoisk_id = ?`
    )
    .get(userId, kinopoiskId) as DbUserFilm | undefined;
}

export function deleteUserFilm(userId: number, kinopoiskId: number): boolean {
  const result = db
    .prepare("DELETE FROM user_films WHERE user_id = ? AND kinopoisk_id = ?")
    .run(userId, kinopoiskId);

  return result.changes > 0;
}
