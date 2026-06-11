import { listUserFilms, type DbUserFilm, type WatchStatus } from "./db.js";
import {
  readCache,
  readFilmCacheStale,
  writeCache,
  type CachedFilm
} from "./kpCache.js";
import {
  ensureFilmsCached,
  getFilterCatalog,
  getRecentCatalog,
  getThemeList,
  getTopList
} from "./kinopoiskProxy.js";
import { getImdbTop250KinopoiskIds, IMDB_TOP_250_PAGE_SIZE } from "./imdbTop250.js";

const STATUS_WEIGHTS: Record<WatchStatus, number> = {
  watched: 3,
  watching: 2,
  plan: 1,
  waiting: 0,
  favorite: 1
};

const PROFILE_STATUSES: WatchStatus[] = ["watched", "watching", "plan", "favorite"];
const WARM_START_MIN_FILMS = 3;
const RESULT_LIMIT = 20;

const GENRE_THEME_MAP: Record<string, string> = {
  фантастика: "COMICS_THEME",
  "научная фантастика": "COMICS_THEME",
  мелодрама: "LOVE_THEME",
  мелодрамы: "LOVE_THEME",
  романтика: "LOVE_THEME",
  комедия: "FAMILY",
  "семейный": "FAMILY",
  ужасы: "VAMPIRE_THEME",
  триллер: "CATASTROPHE_THEME",
  боевик: "CATASTROPHE_THEME"
};

export type RecommendationMode = "cold" | "warm";

export type RecommendationResult = {
  films: CachedFilm[];
  mode: RecommendationMode;
  reason?: string;
};

type ScoredFilm = {
  film: CachedFilm;
  score: number;
  primaryGenre?: string;
};

type RecommendationCachePayload = RecommendationResult;

function normalizeGenre(genre: string): string {
  return genre.trim().toLowerCase();
}

function listFingerprint(items: DbUserFilm[]): string {
  if (items.length === 0) {
    return "empty";
  }

  return items
    .map((item) => `${item.kinopoisk_id}:${item.status}:${item.updated_at}`)
    .sort()
    .join("|");
}

function cacheKey(userId: number, fingerprint: string, scope: "films" | "serials" = "films"): string {
  return scope === "serials" ? `recs:serials:${userId}:${fingerprint}` : `recs:${userId}:${fingerprint}`;
}

export function buildGenreProfile(
  items: DbUserFilm[],
  filmsById: Record<number, CachedFilm>
): Record<string, number> {
  const profile: Record<string, number> = {};

  for (const item of items) {
    if (!PROFILE_STATUSES.includes(item.status)) {
      continue;
    }

    const weight = STATUS_WEIGHTS[item.status];
    const film = filmsById[item.kinopoisk_id];
    const genres = film?.genres;

    if (!genres?.length) {
      continue;
    }

    for (const genre of genres) {
      const key = normalizeGenre(genre);
      profile[key] = (profile[key] ?? 0) + weight;
    }
  }

  return profile;
}

export function countProfileFilms(
  items: DbUserFilm[],
  filmsById: Record<number, CachedFilm>
): number {
  return items.filter((item) => {
    if (!PROFILE_STATUSES.includes(item.status)) {
      return false;
    }
    const genres = filmsById[item.kinopoisk_id]?.genres;
    return Boolean(genres?.length);
  }).length;
}

export function topGenres(profile: Record<string, number>, limit = 2): string[] {
  return Object.entries(profile)
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([genre]) => genre);
}

export function buildReason(profile: Record<string, number>): string | undefined {
  const genres = topGenres(profile, 2);
  if (genres.length === 0) {
    return undefined;
  }

  if (genres.length === 1) {
    return `Потому что вам нравятся ${genres[0]}`;
  }

  return `Потому что вам нравятся ${genres[0]} и ${genres[1]}`;
}

function parseRating(rating?: string): number {
  if (!rating) {
    return 0;
  }

  const parsed = Number.parseFloat(rating);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function yearRecency(year?: string): number {
  const parsedYear = Number.parseInt(year ?? "", 10);
  if (!Number.isFinite(parsedYear)) {
    return 0;
  }

  const currentYear = new Date().getFullYear();
  const span = Math.max(1, currentYear - 1990);
  return Math.max(0, Math.min(1, (parsedYear - 1990) / span));
}

export function scoreFilm(
  film: CachedFilm,
  profile: Record<string, number>,
  userFilmIds: Set<number>
): number {
  if (userFilmIds.has(film.kinopoiskId)) {
    return -100;
  }

  let genreScore = 0;

  for (const genre of film.genres ?? readFilmCacheStale(film.kinopoiskId)?.genres ?? []) {
    const key = normalizeGenre(genre);
    genreScore += profile[key] ?? 0;
  }

  const ratingScore = parseRating(film.rating) * 0.2;
  const recencyScore = yearRecency(film.year) * 0.1;

  return genreScore + ratingScore + recencyScore;
}

function getPrimaryGenre(film: CachedFilm, profile: Record<string, number>): string | undefined {
  let primaryGenre: string | undefined;
  let primaryWeight = 0;

  for (const genre of film.genres ?? readFilmCacheStale(film.kinopoiskId)?.genres ?? []) {
    const key = normalizeGenre(genre);
    const weight = profile[key] ?? 0;

    if (weight > primaryWeight) {
      primaryWeight = weight;
      primaryGenre = key;
    }
  }

  return primaryGenre ?? "other";
}

export function interleaveByGenre(scored: ScoredFilm[], limit: number): CachedFilm[] {
  if (scored.length === 0) {
    return [];
  }

  const buckets = new Map<string, ScoredFilm[]>();

  for (const entry of scored) {
    const key = entry.primaryGenre ?? "other";
    const bucket = buckets.get(key) ?? [];
    bucket.push(entry);
    buckets.set(key, bucket);
  }

  const order = [...buckets.keys()].sort((left, right) => {
    const leftScore = buckets.get(left)?.[0]?.score ?? 0;
    const rightScore = buckets.get(right)?.[0]?.score ?? 0;
    return rightScore - leftScore;
  });

  const result: CachedFilm[] = [];
  let index = 0;

  while (result.length < limit) {
    let added = false;

    for (const key of order) {
      const bucket = buckets.get(key);
      if (!bucket?.length) {
        continue;
      }

      const entry = bucket.shift();
      if (entry) {
        result.push(entry.film);
        added = true;
      }

      if (result.length >= limit) {
        break;
      }
    }

    if (!added) {
      break;
    }

    index += 1;
    if (index > limit * 2) {
      break;
    }
  }

  return result;
}

function themesForProfile(profile: Record<string, number>): string[] {
  const themes = new Set<string>();

  for (const genre of topGenres(profile, 3)) {
    const theme = GENRE_THEME_MAP[genre];
    if (theme) {
      themes.add(theme);
    }
  }

  return [...themes].slice(0, 2);
}

async function ensureAllFilmsCached(kinopoiskIds: number[]): Promise<Record<number, CachedFilm>> {
  const result: Record<number, CachedFilm> = {};

  for (let index = 0; index < kinopoiskIds.length; index += 8) {
    const batch = kinopoiskIds.slice(index, index + 8);
    const batchResult = await ensureFilmsCached(batch, 8);
    Object.assign(result, batchResult);
  }

  return result;
}

async function gatherCandidates(profile: Record<string, number>): Promise<CachedFilm[]> {
  const seen = new Set<number>();
  const candidates: CachedFilm[] = [];

  const addFilms = (films: CachedFilm[]) => {
    for (const film of films) {
      if (seen.has(film.kinopoiskId)) {
        continue;
      }
      seen.add(film.kinopoiskId);
      candidates.push(film);
    }
  };

  try {
    const recent = await getRecentCatalog(1, "FILM");
    addFilms(recent.page.films);
  } catch {
    // skip failed pool
  }

  try {
    const topIds = getImdbTop250KinopoiskIds().slice(0, IMDB_TOP_250_PAGE_SIZE);
    const topFilms = await ensureAllFilmsCached(topIds);
    addFilms(topIds.map((id) => topFilms[id]).filter(Boolean));
  } catch {
    // skip failed pool
  }

  try {
    const legacyTop = await getTopList("TOP_250_BEST_FILMS", 1);
    addFilms(legacyTop.page.films);
  } catch {
    // skip failed pool
  }

  for (const theme of themesForProfile(profile)) {
    try {
      const themed = await getThemeList(theme, 1);
      addFilms(themed.page.films);
    } catch {
      // skip failed theme
    }
  }

  return candidates;
}

async function buildColdStart(userFilmIds: Set<number>): Promise<RecommendationResult> {
  const selectedIds = getImdbTop250KinopoiskIds()
    .filter((kinopoiskId) => !userFilmIds.has(kinopoiskId))
    .slice(0, RESULT_LIMIT);
  const filmsById = await ensureAllFilmsCached(selectedIds);
  const films = selectedIds
    .map((kinopoiskId) => filmsById[kinopoiskId])
    .filter((film): film is CachedFilm => Boolean(film));

  return {
    films,
    mode: "cold"
  };
}

async function buildWarmStart(
  profile: Record<string, number>,
  userFilmIds: Set<number>
): Promise<RecommendationResult> {
  const candidates = await gatherCandidates(profile);

  const scored: ScoredFilm[] = candidates
    .map((film) => ({
      film,
      score: scoreFilm(film, profile, userFilmIds),
      primaryGenre: getPrimaryGenre(film, profile)
    }))
    .filter((entry) => entry.score > -100)
    .sort((left, right) => right.score - left.score);

  const films = interleaveByGenre(scored.slice(0, RESULT_LIMIT * 2), RESULT_LIMIT);

  return {
    films,
    mode: "warm",
    reason: buildReason(profile)
  };
}

async function gatherSerialCandidates(profile: Record<string, number>): Promise<CachedFilm[]> {
  const seen = new Set<number>();
  const candidates: CachedFilm[] = [];

  const addFilms = (films: CachedFilm[]) => {
    for (const film of films) {
      if (seen.has(film.kinopoiskId)) {
        continue;
      }
      seen.add(film.kinopoiskId);
      candidates.push(film);
    }
  };

  try {
    const recent = await getRecentCatalog(1, "TV_SERIES");
    addFilms(recent.page.films);
  } catch {
    // skip failed pool
  }

  try {
    const topRated = await getFilterCatalog({ type: "TV_SERIES", page: 1, order: "RATING" });
    addFilms(topRated.page.films);
  } catch {
    // skip failed pool
  }

  for (const theme of themesForProfile(profile)) {
    try {
      const themed = await getThemeList(theme, 1);
      addFilms(themed.page.films);
    } catch {
      // skip failed theme
    }
  }

  return candidates;
}

async function buildSerialColdStart(userFilmIds: Set<number>): Promise<RecommendationResult> {
  const { page } = await getFilterCatalog({ type: "TV_SERIES", page: 1, order: "RATING" });
  const films = page.films
    .filter((film) => !userFilmIds.has(film.kinopoiskId))
    .sort((left, right) => parseRating(right.rating) - parseRating(left.rating))
    .slice(0, RESULT_LIMIT);

  return {
    films,
    mode: "cold"
  };
}

async function buildSerialWarmStart(
  profile: Record<string, number>,
  userFilmIds: Set<number>
): Promise<RecommendationResult> {
  const candidates = await gatherSerialCandidates(profile);

  const scored: ScoredFilm[] = candidates
    .map((film) => ({
      film,
      score: scoreFilm(film, profile, userFilmIds),
      primaryGenre: getPrimaryGenre(film, profile)
    }))
    .filter((entry) => entry.score > -100)
    .sort((left, right) => right.score - left.score);

  const films = interleaveByGenre(scored.slice(0, RESULT_LIMIT * 2), RESULT_LIMIT);

  return {
    films,
    mode: "warm",
    reason: buildReason(profile)
  };
}

export async function getRecommendations(userId: number): Promise<RecommendationResult> {
  const items = listUserFilms(userId);
  const fingerprint = listFingerprint(items);
  const key = cacheKey(userId, fingerprint);
  const cached = readCache<RecommendationCachePayload>(key, "recommendations");

  if (cached) {
    return cached;
  }

  const userFilmIds = new Set(items.map((item) => item.kinopoisk_id));
  const profileIds = items
    .filter((item) => PROFILE_STATUSES.includes(item.status))
    .map((item) => item.kinopoisk_id);

  const profileFilms = await ensureAllFilmsCached(profileIds);
  const profile = buildGenreProfile(items, profileFilms);
  const profileFilmCount = countProfileFilms(items, profileFilms);

  const result =
    profileFilmCount >= WARM_START_MIN_FILMS
      ? await buildWarmStart(profile, userFilmIds)
      : await buildColdStart(userFilmIds);

  writeCache(key, result);
  return result;
}

export async function getSerialRecommendations(userId: number): Promise<RecommendationResult> {
  const items = listUserFilms(userId);
  const fingerprint = listFingerprint(items);
  const key = cacheKey(userId, fingerprint, "serials");
  const cached = readCache<RecommendationCachePayload>(key, "recommendations");

  if (cached) {
    return cached;
  }

  const userFilmIds = new Set(items.map((item) => item.kinopoisk_id));
  const profileIds = items
    .filter((item) => PROFILE_STATUSES.includes(item.status))
    .map((item) => item.kinopoisk_id);

  const profileFilms = await ensureAllFilmsCached(profileIds);
  const profile = buildGenreProfile(items, profileFilms);
  const profileFilmCount = countProfileFilms(items, profileFilms);

  const result =
    profileFilmCount >= WARM_START_MIN_FILMS
      ? await buildSerialWarmStart(profile, userFilmIds)
      : await buildSerialColdStart(userFilmIds);

  writeCache(key, result);
  return result;
}
