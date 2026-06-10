import {
  readCache,
  readCacheStale,
  readFilmCache,
  writeCache,
  writeFilmCache,
  type CachedFilm
} from "./kpCache.js";

const DEFAULT_BASE_URL = "https://kinopoiskapiunofficial.tech/api";

type KinopoiskCatalogPage = {
  films: CachedFilm[];
  page: number;
  totalPages: number;
};

type SearchFilmResponse = {
  films?: Array<Record<string, unknown>>;
  items?: Array<Record<string, unknown>>;
  total?: number;
  totalPages?: number;
  pagesCount?: number;
};

const TOP_TYPES = new Set([
  "TOP_250_BEST_FILMS",
  "TOP_100_POPULAR_FILMS",
  "TOP_AWAIT_FILMS"
]);

const THEME_TYPES = new Set([
  "VAMPIRE_THEME",
  "ZOMBIE_THEME",
  "LOVE_THEME",
  "COMICS_THEME",
  "FAMILY",
  "CATASTROPHE_THEME",
  "KIDS_ANIMATION_THEME",
  "CLOSES_RELEASES",
  "TOP_POPULAR_MOVIES",
  "TOP_POPULAR_SERIES",
  "TOP_POPULAR_ALL"
]);

export function isKinopoiskKeyConfigured(): boolean {
  const apiKey =
    process.env.KINOPOISK_API_KEY ??
    process.env.VITE_KINOPOISK_API_KEY ??
    "";

  return Boolean(apiKey.trim());
}

function getApiKey(): string {
  const apiKey =
    process.env.KINOPOISK_API_KEY ??
    process.env.VITE_KINOPOISK_API_KEY ??
    "";

  if (!apiKey.trim()) {
    throw new Error("KINOPOISK_API_KEY не настроен на сервере");
  }

  return apiKey.trim();
}

function getBaseUrl(): string {
  return (
    process.env.KINOPOISK_API_BASE_URL ??
    process.env.VITE_KINOPOISK_API_BASE_URL ??
    DEFAULT_BASE_URL
  ).replace(/\/+$/, "");
}

const KP_RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const KP_MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function requestKinopoisk<T>(path: string, attempt = 0): Promise<T> {
  const response = await fetch(`${getBaseUrl()}${path}`, {
    headers: {
      Accept: "application/json",
      "X-API-KEY": getApiKey()
    }
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    const details = payload?.message ?? `Kinopoisk API failed with status ${response.status}`;

    if (KP_RETRYABLE_STATUSES.has(response.status) && attempt < KP_MAX_RETRIES) {
      await sleep(800 * (attempt + 1));
      return requestKinopoisk<T>(path, attempt + 1);
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error(`Неверный Kinopoisk API ключ: ${details}`);
    }

    if (response.status === 402) {
      throw new Error(`Лимит Kinopoisk API исчерпан: ${details}`);
    }

    if (response.status === 429) {
      throw new Error(`Превышен лимит запросов Kinopoisk API: ${details}`);
    }

    throw new Error(details);
  }

  return (await response.json()) as T;
}

async function cachedRequest<T>(
  cacheKey: string,
  kind: "film" | "catalog" | "search" | "list",
  fetcher: () => Promise<T>
): Promise<{ data: T; fromCache: boolean }> {
  const cached = readCache<T>(cacheKey, kind);
  if (cached) {
    return { data: cached, fromCache: true };
  }

  try {
    const data = await fetcher();
    writeCache(cacheKey, data);
    return { data, fromCache: false };
  } catch (error) {
    const stale = readCacheStale<T>(cacheKey);
    if (stale) {
      return { data: stale, fromCache: true };
    }

    throw error;
  }
}

export function isFilmDetailsCacheComplete(film: CachedFilm): boolean {
  return (
    Boolean(film.description) ||
    Boolean(film.genres?.length) ||
    film.filmLengthMinutes !== undefined
  );
}

export async function getFilmDetails(kinopoiskId: number): Promise<{ film: CachedFilm; fromCache: boolean }> {
  const cached = readFilmCache(kinopoiskId);
  if (cached && isFilmDetailsCacheComplete(cached)) {
    return { film: cached, fromCache: true };
  }

  const cacheKey = `film:${kinopoiskId}`;
  const kpCached = readCache<Record<string, unknown>>(cacheKey, "film");
  const raw =
    kpCached ??
    (await requestKinopoisk<Record<string, unknown>>(`/v2.2/films/${kinopoiskId}`));

  if (!kpCached) {
    writeCache(cacheKey, raw);
  }

  const film = mapFilmDetails(raw);
  writeFilmCache(film);
  return { film, fromCache: false };
}

export async function getRecentCatalog(
  page: number,
  type: "FILM" | "TV_SERIES"
): Promise<{ page: KinopoiskCatalogPage; fromCache: boolean }> {
  const cacheKey = `catalog:recent:${type}:${page}`;
  const { data, fromCache } = await cachedRequest(cacheKey, "catalog", async () => {
    const params = new URLSearchParams({
      order: "YEAR",
      type,
      ratingFrom: "6",
      ratingTo: "10",
      yearFrom: "2024",
      yearTo: "2026",
      page: String(page)
    });
    const response = await requestKinopoisk<SearchFilmResponse>(`/v2.2/films?${params.toString()}`);
    return mapCatalogPage(response, page);
  });

  for (const film of data.films) {
    writeFilmCache(film);
  }

  return { page: data, fromCache };
}

export async function searchCatalog(
  keyword: string,
  page: number
): Promise<{ page: KinopoiskCatalogPage; fromCache: boolean }> {
  const trimmed = keyword.trim();
  if (!trimmed) {
    return { page: { films: [], page: 1, totalPages: 1 }, fromCache: true };
  }

  const cacheKey = `search:${trimmed.toLowerCase()}:${page}`;
  const { data, fromCache } = await cachedRequest(cacheKey, "search", async () => {
    const params = new URLSearchParams({
      keyword: trimmed,
      page: String(page)
    });
    const response = await requestKinopoisk<SearchFilmResponse>(
      `/v2.1/films/search-by-keyword?${params.toString()}`
    );
    return mapCatalogPage(response, page);
  });

  for (const film of data.films) {
    writeFilmCache(film);
  }

  return { page: data, fromCache };
}

export async function getTopList(
  type: string,
  page: number
): Promise<{ page: KinopoiskCatalogPage; fromCache: boolean }> {
  if (!TOP_TYPES.has(type)) {
    throw new Error("Некорректный тип топа");
  }

  const cacheKey = `top:${type}:${page}`;
  const { data, fromCache } = await cachedRequest(cacheKey, "list", async () => {
    const params = new URLSearchParams({ type, page: String(page) });
    const response = await requestKinopoisk<SearchFilmResponse>(
      `/v2.2/films/top?${params.toString()}`
    );
    return mapCatalogPage(response, page);
  });

  for (const film of data.films) {
    writeFilmCache(film);
  }

  return { page: data, fromCache };
}

export async function getThemeList(
  type: string,
  page: number
): Promise<{ page: KinopoiskCatalogPage; fromCache: boolean }> {
  if (!THEME_TYPES.has(type)) {
    throw new Error("Некорректный тип подборки");
  }

  const cacheKey = `theme:${type}:${page}`;
  const { data, fromCache } = await cachedRequest(cacheKey, "list", async () => {
    const params = new URLSearchParams({ type, page: String(page) });
    const response = await requestKinopoisk<SearchFilmResponse>(
      `/v2.2/films/collections?${params.toString()}`
    );
    return mapCatalogPage(response, page);
  });

  for (const film of data.films) {
    writeFilmCache(film);
  }

  return { page: data, fromCache };
}

export async function probeKinopoisk(): Promise<{
  ok: boolean;
  keyConfigured: boolean;
  fromCache: boolean;
  error?: string;
}> {
  if (!isKinopoiskKeyConfigured()) {
    return {
      ok: false,
      keyConfigured: false,
      fromCache: false,
      error: "KINOPOISK_API_KEY не настроен на сервере"
    };
  }

  try {
    const result = await getRecentCatalog(1, "FILM");
    return {
      ok: true,
      keyConfigured: true,
      fromCache: result.fromCache
    };
  } catch (error) {
    return {
      ok: false,
      keyConfigured: true,
      fromCache: false,
      error: error instanceof Error ? error.message : "Kinopoisk probe failed"
    };
  }
}

const SIMILAR_RESULT_LIMIT = 10;
const SIMILAR_FETCH_CAP = 24;

type SimilarFilmResponse = {
  items?: Array<Record<string, unknown>>;
};

function parseRating(rating?: string): number {
  if (!rating) {
    return 0;
  }

  const parsed = Number.parseFloat(rating);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getSimilarFilms(
  kinopoiskId: number,
  limit = SIMILAR_RESULT_LIMIT
): Promise<{ films: CachedFilm[]; fromCache: boolean }> {
  const cacheKey = `similars:${kinopoiskId}:${limit}`;
  const cached = readCache<CachedFilm[]>(cacheKey, "list");
  if (cached) {
    return { films: cached, fromCache: true };
  }

  const response = await requestKinopoisk<SimilarFilmResponse>(
    `/v2.2/films/${kinopoiskId}/similars`
  );

  const summaries = (response.items ?? [])
    .map((raw) => mapFilmSummary(raw))
    .filter(
      (film): film is CachedFilm =>
        film !== null && film.kinopoiskId !== kinopoiskId && Boolean(film.posterUrl)
    )
    .slice(0, SIMILAR_FETCH_CAP);

  const enriched = await ensureFilmsCached(
    summaries.map((film) => film.kinopoiskId),
    SIMILAR_FETCH_CAP
  );

  const films = summaries
    .map((summary) => enriched[summary.kinopoiskId] ?? summary)
    .filter((film) => Boolean(film.posterUrl))
    .sort((left, right) => parseRating(right.rating) - parseRating(left.rating))
    .slice(0, limit);

  writeCache(cacheKey, films);

  for (const film of films) {
    writeFilmCache(film);
  }

  return { films, fromCache: false };
}

export async function ensureFilmsCached(
  kinopoiskIds: number[],
  maxFetch = 5
): Promise<Record<number, CachedFilm>> {
  const result: Record<number, CachedFilm> = {};
  const missing: number[] = [];

  for (const kinopoiskId of kinopoiskIds) {
    const cached = readFilmCache(kinopoiskId);
    if (cached) {
      result[kinopoiskId] = cached;
    } else {
      missing.push(kinopoiskId);
    }
  }

  for (const kinopoiskId of missing.slice(0, maxFetch)) {
    try {
      const { film } = await getFilmDetails(kinopoiskId);
      result[kinopoiskId] = film;
    } catch {
      // skip failed film
    }
  }

  return result;
}

export function resolveCatalogTotalPages(
  data: SearchFilmResponse,
  page: number,
  itemCount: number
): number {
  return resolveTotalPages(data, page, itemCount);
}

const CATALOG_PAGE_SIZE = 20;

function resolveTotalPages(data: SearchFilmResponse, page: number, itemCount: number): number {
  const explicit = toNumber(data.totalPages ?? data.pagesCount);
  if (explicit && explicit > 0) {
    return explicit;
  }

  const totalItems = toNumber(data.total);
  if (totalItems && itemCount > 0) {
    return Math.max(1, Math.ceil(totalItems / itemCount));
  }

  if (itemCount === 0) {
    return Math.max(1, page - 1);
  }

  if (itemCount >= CATALOG_PAGE_SIZE) {
    return page + 1;
  }

  return Math.max(1, page);
}

function mapCatalogPage(data: SearchFilmResponse, page: number): KinopoiskCatalogPage {
  const films = (data.items ?? data.films ?? [])
    .map((raw) => mapFilmSummary(raw))
    .filter((film): film is CachedFilm => film !== null);

  const totalPages = resolveTotalPages(data, page, films.length);

  return {
    films,
    page,
    totalPages
  };
}

export function mapFilmDetails(raw: Record<string, unknown>): CachedFilm {
  const summary = mapFilmSummary(raw);
  if (!summary) {
    throw new Error("Kinopoisk API returned film without id");
  }

  return {
    ...summary,
    description: toStringValue(raw.description ?? raw.shortDescription),
    genres: mapNamedList(raw.genres),
    filmLengthMinutes: toNumber(raw.filmLength)
  };
}

function mapFilmSummary(raw: Record<string, unknown>): CachedFilm | null {
  const kinopoiskId = toNumber(raw.filmId ?? raw.kinopoiskId);
  if (!kinopoiskId) {
    return null;
  }

  return {
    kinopoiskId,
    title: toStringValue(raw.nameRu ?? raw.nameEn ?? raw.nameOriginal) ?? "Без названия",
    originalTitle: toStringValue(raw.nameEn ?? raw.nameOriginal),
    year: toStringValue(raw.year),
    posterUrl: normalizePosterUrl(raw.posterUrlPreview ?? raw.posterUrl),
    rating: toStringValue(raw.rating ?? raw.ratingKinopoisk),
    imdbRating: formatRatingValue(raw.ratingImdb)
  };
}

function formatRatingValue(value: unknown): string | undefined {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseFloat(toStringValue(value) ?? "");

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(1);
}

function mapNamedList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const names = value
    .map((item) =>
      typeof item === "object" && item !== null ? toStringValue((item as { name?: unknown }).name) : undefined
    )
    .filter((item): item is string => Boolean(item));

  return names.length > 0 ? names : undefined;
}

function normalizePosterUrl(value: unknown): string | undefined {
  const posterUrl = toStringValue(value);
  if (!posterUrl || posterUrl.toLowerCase().includes("no-poster")) {
    return undefined;
  }
  return posterUrl;
}

function toStringValue(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  return String(value);
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
