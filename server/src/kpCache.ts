import { db } from "./db.js";

const TTL_MS = {
  film: 30 * 24 * 60 * 60 * 1000,
  catalog: 6 * 60 * 60 * 1000,
  search: 2 * 60 * 60 * 1000,
  list: 24 * 60 * 60 * 1000,
  recommendations: 24 * 60 * 60 * 1000
} as const;

type CacheKind = keyof typeof TTL_MS;

db.exec(`
  CREATE TABLE IF NOT EXISTS kp_cache (
    cache_key TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    fetched_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS films_cache (
    kinopoisk_id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    original_title TEXT,
    year TEXT,
    poster_url TEXT,
    rating TEXT,
    description TEXT,
    film_length_minutes INTEGER,
    genres TEXT,
    fetched_at TEXT NOT NULL
  );
`);

export function readCache<T>(cacheKey: string, kind: CacheKind): T | null {
  const row = db
    .prepare("SELECT payload, fetched_at FROM kp_cache WHERE cache_key = ?")
    .get(cacheKey) as { payload: string; fetched_at: string } | undefined;

  if (!row) {
    return null;
  }

  const age = Date.now() - Date.parse(row.fetched_at);
  if (age > TTL_MS[kind]) {
    return null;
  }

  return JSON.parse(row.payload) as T;
}

export function writeCache(cacheKey: string, payload: unknown): void {
  db.prepare(
    `INSERT INTO kp_cache (cache_key, payload, fetched_at)
     VALUES (?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET
       payload = excluded.payload,
       fetched_at = excluded.fetched_at`
  ).run(cacheKey, JSON.stringify(payload), new Date().toISOString());
}

export type CachedFilm = {
  kinopoiskId: number;
  title: string;
  originalTitle?: string;
  year?: string;
  posterUrl?: string;
  rating?: string;
  description?: string;
  filmLengthMinutes?: number;
  genres?: string[];
};

export function readFilmCache(kinopoiskId: number): CachedFilm | null {
  const row = db
    .prepare(
      `SELECT kinopoisk_id, title, original_title, year, poster_url, rating,
              description, film_length_minutes, genres, fetched_at
       FROM films_cache WHERE kinopoisk_id = ?`
    )
    .get(kinopoiskId) as
    | {
        kinopoisk_id: number;
        title: string;
        original_title: string | null;
        year: string | null;
        poster_url: string | null;
        rating: string | null;
        description: string | null;
        film_length_minutes: number | null;
        genres: string | null;
        fetched_at: string;
      }
    | undefined;

  if (!row) {
    return null;
  }

  const age = Date.now() - Date.parse(row.fetched_at);
  if (age > TTL_MS.film) {
    return null;
  }

  return {
    kinopoiskId: row.kinopoisk_id,
    title: row.title,
    originalTitle: row.original_title ?? undefined,
    year: row.year ?? undefined,
    posterUrl: row.poster_url ?? undefined,
    rating: row.rating ?? undefined,
    description: row.description ?? undefined,
    filmLengthMinutes: row.film_length_minutes ?? undefined,
    genres: row.genres ? (JSON.parse(row.genres) as string[]) : undefined
  };
}

export function writeFilmCache(film: CachedFilm): void {
  db.prepare(
    `INSERT INTO films_cache (
       kinopoisk_id, title, original_title, year, poster_url, rating,
       description, film_length_minutes, genres, fetched_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(kinopoisk_id) DO UPDATE SET
       title = excluded.title,
       original_title = excluded.original_title,
       year = excluded.year,
       poster_url = excluded.poster_url,
       rating = excluded.rating,
       description = excluded.description,
       film_length_minutes = excluded.film_length_minutes,
       genres = excluded.genres,
       fetched_at = excluded.fetched_at`
  ).run(
    film.kinopoiskId,
    film.title,
    film.originalTitle ?? null,
    film.year ?? null,
    film.posterUrl ?? null,
    film.rating ?? null,
    film.description ?? null,
    film.filmLengthMinutes ?? null,
    film.genres ? JSON.stringify(film.genres) : null,
    new Date().toISOString()
  );
}

export function readFilmCacheStale(kinopoiskId: number): CachedFilm | null {
  const row = db
    .prepare(
      `SELECT kinopoisk_id, title, original_title, year, poster_url, rating,
              description, film_length_minutes, genres, fetched_at
       FROM films_cache WHERE kinopoisk_id = ?`
    )
    .get(kinopoiskId) as
    | {
        kinopoisk_id: number;
        title: string;
        original_title: string | null;
        year: string | null;
        poster_url: string | null;
        rating: string | null;
        description: string | null;
        film_length_minutes: number | null;
        genres: string | null;
        fetched_at: string;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    kinopoiskId: row.kinopoisk_id,
    title: row.title,
    originalTitle: row.original_title ?? undefined,
    year: row.year ?? undefined,
    posterUrl: row.poster_url ?? undefined,
    rating: row.rating ?? undefined,
    description: row.description ?? undefined,
    filmLengthMinutes: row.film_length_minutes ?? undefined,
    genres: row.genres ? (JSON.parse(row.genres) as string[]) : undefined
  };
}

export function readFilmsCache(kinopoiskIds: number[]): Record<number, CachedFilm> {
  const result: Record<number, CachedFilm> = {};

  for (const kinopoiskId of kinopoiskIds) {
    const film = readFilmCache(kinopoiskId);
    if (film) {
      result[kinopoiskId] = film;
    }
  }

  return result;
}
