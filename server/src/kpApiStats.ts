import { db } from "./db.js";

type ApiStatsRow = {
  total_calls: number;
  today_calls: number;
  today_date: string;
  updated_at: string;
};

export type KinopoiskApiStats = {
  totalCalls: number;
  todayCalls: number;
  todayDate: string;
  updatedAt: string;
};

db.exec(`
  CREATE TABLE IF NOT EXISTS kp_api_stats (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    total_calls INTEGER NOT NULL DEFAULT 0,
    today_calls INTEGER NOT NULL DEFAULT 0,
    today_date TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function ensureStatsRow(): ApiStatsRow {
  const existing = db
    .prepare(
      `SELECT total_calls, today_calls, today_date, updated_at
       FROM kp_api_stats
       WHERE id = 1`
    )
    .get() as ApiStatsRow | undefined;

  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const today = todayKey();
  db.prepare(
    `INSERT INTO kp_api_stats (id, total_calls, today_calls, today_date, updated_at)
     VALUES (1, 0, 0, ?, ?)`
  ).run(today, now);

  return {
    total_calls: 0,
    today_calls: 0,
    today_date: today,
    updated_at: now
  };
}

export function recordKinopoiskApiCall(): void {
  const now = new Date().toISOString();
  const today = todayKey();
  const current = ensureStatsRow();
  const todayCalls = current.today_date === today ? current.today_calls + 1 : 1;

  db.prepare(
    `UPDATE kp_api_stats
     SET total_calls = total_calls + 1,
         today_calls = ?,
         today_date = ?,
         updated_at = ?
     WHERE id = 1`
  ).run(todayCalls, today, now);
}

export function getKinopoiskApiStats(): KinopoiskApiStats {
  const row = ensureStatsRow();
  const today = todayKey();

  if (row.today_date !== today) {
    return {
      totalCalls: row.total_calls,
      todayCalls: 0,
      todayDate: today,
      updatedAt: row.updated_at
    };
  }

  return {
    totalCalls: row.total_calls,
    todayCalls: row.today_calls,
    todayDate: row.today_date,
    updatedAt: row.updated_at
  };
}
