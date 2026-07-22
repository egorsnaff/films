import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

export type WatchStatus = "watching" | "plan" | "waiting" | "watched" | "favorite";

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

export type DbUserFilmAggregate = {
  user_id: number;
  kinopoisk_id: number;
  lists: WatchStatus[];
  watch_seconds: number;
  progress_percent: number;
  updated_at: string;
};

const LIST_KEYS: WatchStatus[] = ["watching", "plan", "waiting", "watched", "favorite"];

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

  CREATE TABLE IF NOT EXISTS user_film_memberships (
    user_id INTEGER NOT NULL,
    kinopoisk_id INTEGER NOT NULL,
    list_key TEXT NOT NULL CHECK(list_key IN ('watching', 'plan', 'waiting', 'watched', 'favorite')),
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, kinopoisk_id, list_key),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_film_progress (
    user_id INTEGER NOT NULL,
    kinopoisk_id INTEGER NOT NULL,
    watch_seconds INTEGER NOT NULL DEFAULT 0,
    progress_percent REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, kinopoisk_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
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

function migrateListsV2(): void {
  const migrated = db
    .prepare("SELECT value FROM app_meta WHERE key = 'lists_v2'")
    .get() as { value: string } | undefined;

  if (migrated?.value === "1") {
    return;
  }

  const legacyRows = db
    .prepare(
      `SELECT user_id, kinopoisk_id, status, watch_seconds, progress_percent, updated_at
       FROM user_films`
    )
    .all() as Array<{
    user_id: number;
    kinopoisk_id: number;
    status: WatchStatus;
    watch_seconds: number;
    progress_percent: number;
    updated_at: string;
  }>;

  const insertMembership = db.prepare(
    `INSERT OR IGNORE INTO user_film_memberships (user_id, kinopoisk_id, list_key, updated_at)
     VALUES (?, ?, ?, ?)`
  );
  const insertProgress = db.prepare(
    `INSERT OR IGNORE INTO user_film_progress
       (user_id, kinopoisk_id, watch_seconds, progress_percent, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, kinopoisk_id) DO UPDATE SET
       watch_seconds = MAX(user_film_progress.watch_seconds, excluded.watch_seconds),
       progress_percent = MAX(user_film_progress.progress_percent, excluded.progress_percent),
       updated_at = excluded.updated_at`
  );

  for (const row of legacyRows) {
    insertMembership.run(row.user_id, row.kinopoisk_id, row.status, row.updated_at);
    if (row.watch_seconds > 0 || row.progress_percent > 0) {
      insertProgress.run(
        row.user_id,
        row.kinopoisk_id,
        row.watch_seconds,
        row.progress_percent,
        row.updated_at
      );
    }
  }

  db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('lists_v2', '1')").run();
}

migrateListsV2();

function isWatchStatus(value: string): value is WatchStatus {
  return LIST_KEYS.includes(value as WatchStatus);
}

function readProgress(
  userId: number,
  kinopoiskId: number
): { watch_seconds: number; progress_percent: number; updated_at: string } | undefined {
  return db
    .prepare(
      `SELECT watch_seconds, progress_percent, updated_at
       FROM user_film_progress
       WHERE user_id = ? AND kinopoisk_id = ?`
    )
    .get(userId, kinopoiskId) as
    | { watch_seconds: number; progress_percent: number; updated_at: string }
    | undefined;
}

function listMembershipKeys(userId: number, kinopoiskId: number): WatchStatus[] {
  const rows = db
    .prepare(
      `SELECT list_key
       FROM user_film_memberships
       WHERE user_id = ? AND kinopoisk_id = ?
       ORDER BY updated_at DESC`
    )
    .all(userId, kinopoiskId) as Array<{ list_key: string }>;

  return rows.map((row) => row.list_key).filter(isWatchStatus);
}

function toAggregate(userId: number, kinopoiskId: number): DbUserFilmAggregate | undefined {
  const lists = listMembershipKeys(userId, kinopoiskId);
  const progress = readProgress(userId, kinopoiskId);
  const latestMembership = db
    .prepare(
      `SELECT updated_at
       FROM user_film_memberships
       WHERE user_id = ? AND kinopoisk_id = ?
       ORDER BY updated_at DESC
       LIMIT 1`
    )
    .get(userId, kinopoiskId) as { updated_at: string } | undefined;

  if (lists.length === 0 && !progress) {
    return undefined;
  }

  return {
    user_id: userId,
    kinopoisk_id: kinopoiskId,
    lists,
    watch_seconds: progress?.watch_seconds ?? 0,
    progress_percent: progress?.progress_percent ?? 0,
    updated_at: progress?.updated_at ?? latestMembership?.updated_at ?? new Date().toISOString()
  };
}

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

export function listUserFilmsAggregated(userId: number): DbUserFilmAggregate[] {
  const ids = db
    .prepare(
      `SELECT DISTINCT kinopoisk_id
       FROM (
         SELECT kinopoisk_id FROM user_film_memberships WHERE user_id = ?
         UNION
         SELECT kinopoisk_id FROM user_film_progress WHERE user_id = ?
       )`
    )
    .all(userId, userId) as Array<{ kinopoisk_id: number }>;

  return ids
    .map((row) => toAggregate(userId, row.kinopoisk_id))
    .filter((entry): entry is DbUserFilmAggregate => Boolean(entry))
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}

export function listUserFilms(userId: number): DbUserFilm[] {
  return listUserFilmsAggregated(userId).flatMap((aggregate) =>
    aggregate.lists.map((status) => ({
      user_id: aggregate.user_id,
      kinopoisk_id: aggregate.kinopoisk_id,
      status,
      watch_seconds: aggregate.watch_seconds,
      progress_percent: aggregate.progress_percent,
      updated_at: aggregate.updated_at
    }))
  );
}

export function addUserFilmToList(
  userId: number,
  kinopoiskId: number,
  status: WatchStatus
): DbUserFilmAggregate {
  const updatedAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO user_film_memberships (user_id, kinopoisk_id, list_key, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, kinopoisk_id, list_key) DO UPDATE SET
       updated_at = excluded.updated_at`
  ).run(userId, kinopoiskId, status, updatedAt);

  // «Просмотренное» вытесняет «Смотрю сейчас».
  if (status === "watched") {
    db.prepare(
      `DELETE FROM user_film_memberships
       WHERE user_id = ? AND kinopoisk_id = ? AND list_key = 'watching'`
    ).run(userId, kinopoiskId);
  }

  return toAggregate(userId, kinopoiskId)!;
}

export function removeUserFilmFromList(
  userId: number,
  kinopoiskId: number,
  status: WatchStatus
): DbUserFilmAggregate | undefined {
  db.prepare(
    `DELETE FROM user_film_memberships
     WHERE user_id = ? AND kinopoisk_id = ? AND list_key = ?`
  ).run(userId, kinopoiskId, status);

  const aggregate = toAggregate(userId, kinopoiskId);
  if (!aggregate) {
    db.prepare(`DELETE FROM user_film_progress WHERE user_id = ? AND kinopoisk_id = ?`).run(
      userId,
      kinopoiskId
    );
  }

  return aggregate;
}

export function upsertUserFilm(userId: number, kinopoiskId: number, status: WatchStatus): DbUserFilm {
  const aggregate = addUserFilmToList(userId, kinopoiskId, status);
  return {
    user_id: aggregate.user_id,
    kinopoisk_id: aggregate.kinopoisk_id,
    status,
    watch_seconds: aggregate.watch_seconds,
    progress_percent: aggregate.progress_percent,
    updated_at: aggregate.updated_at
  };
}

export const MIN_WATCH_SECONDS_FOR_WATCHING = 300;

export function resolveProgressStatus(
  existing: DbUserFilm | undefined,
  watchSeconds: number,
  progressPercent: number,
  forceStatus?: WatchStatus
): WatchStatus | null {
  const currentLists = existing ? [existing.status] : [];

  return resolveAutoListMemberships(currentLists, watchSeconds, progressPercent, forceStatus)[0] ?? null;
}

export function resolveAutoListMemberships(
  currentLists: WatchStatus[],
  watchSeconds: number,
  progressPercent: number,
  forceStatus?: WatchStatus
): WatchStatus[] {
  if (progressPercent >= 90 || forceStatus === "watched") {
    return currentLists.includes("watched") ? [] : ["watched"];
  }

  if (forceStatus && forceStatus !== "watching") {
    return currentLists.includes(forceStatus) ? [] : [forceStatus];
  }

  if (watchSeconds < MIN_WATCH_SECONDS_FOR_WATCHING || currentLists.includes("watched")) {
    return [];
  }

  return currentLists.includes("watching") ? [] : ["watching"];
}

export function updateUserFilmProgress(
  userId: number,
  kinopoiskId: number,
  watchSeconds: number,
  progressPercent: number,
  forceStatus?: WatchStatus
): DbUserFilm | null {
  const updatedAt = new Date().toISOString();
  const currentLists = listMembershipKeys(userId, kinopoiskId);
  const membershipsToAdd = resolveAutoListMemberships(
    currentLists,
    watchSeconds,
    progressPercent,
    forceStatus
  );

  if (
    membershipsToAdd.length === 0 &&
    watchSeconds === 0 &&
    progressPercent === 0 &&
    currentLists.length === 0
  ) {
    return null;
  }

  db.prepare(
    `INSERT INTO user_film_progress (user_id, kinopoisk_id, watch_seconds, progress_percent, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, kinopoisk_id) DO UPDATE SET
       watch_seconds = MAX(user_film_progress.watch_seconds, excluded.watch_seconds),
       progress_percent = MAX(user_film_progress.progress_percent, excluded.progress_percent),
       updated_at = excluded.updated_at`
  ).run(userId, kinopoiskId, watchSeconds, progressPercent, updatedAt);

  for (const status of membershipsToAdd) {
    addUserFilmToList(userId, kinopoiskId, status);
  }

  const aggregate = toAggregate(userId, kinopoiskId);
  if (!aggregate || aggregate.lists.length === 0) {
    return null;
  }

  const primaryStatus =
    aggregate.lists.find((status) => status === "watched") ??
    aggregate.lists.find((status) => status === "watching") ??
    aggregate.lists[0];

  return {
    user_id: aggregate.user_id,
    kinopoisk_id: aggregate.kinopoisk_id,
    status: primaryStatus,
    watch_seconds: aggregate.watch_seconds,
    progress_percent: aggregate.progress_percent,
    updated_at: aggregate.updated_at
  };
}

export function deleteUserFilm(userId: number, kinopoiskId: number): boolean {
  const membershipResult = db
    .prepare(`DELETE FROM user_film_memberships WHERE user_id = ? AND kinopoisk_id = ?`)
    .run(userId, kinopoiskId);
  const progressResult = db
    .prepare(`DELETE FROM user_film_progress WHERE user_id = ? AND kinopoisk_id = ?`)
    .run(userId, kinopoiskId);

  return membershipResult.changes + progressResult.changes > 0;
}
