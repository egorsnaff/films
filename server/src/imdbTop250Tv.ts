import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { readCache, writeCache, writeFilmCache, type CachedFilm } from "./kpCache.js";
import { ensureFilmsCached } from "./kinopoiskProxy.js";

export const IMDB_TOP_250_TV_TYPE = "IMDB_TOP_250_TV";
export const IMDB_TOP_250_TV_PAGE_SIZE = 20;

type ImdbTop250TvFileEntry = {
  rank: number;
  title: string;
  year: string | null;
  imdbId: string;
  kinopoiskId: number;
  matchedTitle?: string;
  matchedYear?: string;
  matchScore?: number;
};

type ImdbTop250TvFile = {
  source: string;
  syncedAt: string;
  entries: ImdbTop250TvFileEntry[];
};

type KinopoiskCatalogPage = {
  films: CachedFilm[];
  page: number;
  totalPages: number;
};

let cachedManifest: ImdbTop250TvFile | null = null;

function getManifestPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "../src/data/imdb-top-250-tv.json");
}

export function loadImdbTop250TvManifest(): ImdbTop250TvFile {
  if (cachedManifest) {
    return cachedManifest;
  }

  const raw = readFileSync(getManifestPath(), "utf8");
  cachedManifest = JSON.parse(raw) as ImdbTop250TvFile;
  return cachedManifest;
}

export function getImdbTop250TvKinopoiskIds(): number[] {
  return loadImdbTop250TvManifest()
    .entries.slice()
    .sort((left, right) => left.rank - right.rank)
    .map((entry) => entry.kinopoiskId);
}

export function getImdbTop250TvTotalPages(): number {
  const count = getImdbTop250TvKinopoiskIds().length;
  return Math.max(1, Math.ceil(count / IMDB_TOP_250_TV_PAGE_SIZE));
}

export async function getImdbTop250TvPage(
  page: number
): Promise<{ page: KinopoiskCatalogPage; fromCache: boolean }> {
  const safePage = Math.max(1, page);
  const cacheKey = `top:${IMDB_TOP_250_TV_TYPE}:${safePage}`;
  const cached = readCache<KinopoiskCatalogPage>(cacheKey, "list");
  if (cached) {
    return { page: cached, fromCache: true };
  }

  const ids = getImdbTop250TvKinopoiskIds();
  const totalPages = getImdbTop250TvTotalPages();
  const start = (safePage - 1) * IMDB_TOP_250_TV_PAGE_SIZE;
  const slice = ids.slice(start, start + IMDB_TOP_250_TV_PAGE_SIZE);
  const filmsById = await ensureFilmsCached(slice, slice.length);

  const films = slice
    .map((kinopoiskId) => filmsById[kinopoiskId])
    .filter((film): film is CachedFilm => Boolean(film));

  for (const film of films) {
    writeFilmCache(film);
  }

  const payload: KinopoiskCatalogPage = {
    films,
    page: safePage,
    totalPages
  };

  writeCache(cacheKey, payload);
  return { page: payload, fromCache: false };
}

export function resetImdbTop250TvManifestCache(): void {
  cachedManifest = null;
}
