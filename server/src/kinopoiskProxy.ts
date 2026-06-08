import {
  readCache,
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
  "TOP_POPULAR_SERIES"
]);

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

async function requestKinopoisk<T>(path: string): Promise<T> {
  const response = await fetch(`${getBaseUrl()}${path}`, {
    headers: {
      Accept: "application/json",
      "X-API-KEY": getApiKey()
    }
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? `Kinopoisk API failed with status ${response.status}`);
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

  const data = await fetcher();
  writeCache(cacheKey, data);
  return { data, fromCache: false };
}

export async function getFilmDetails(kinopoiskId: number): Promise<{ film: CachedFilm; fromCache: boolean }> {
  const cached = readFilmCache(kinopoiskId);
  if (cached) {
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

function mapCatalogPage(data: SearchFilmResponse, page: number): KinopoiskCatalogPage {
  const films = (data.items ?? data.films ?? [])
    .map((raw) => mapFilmSummary(raw))
    .filter((film): film is CachedFilm => film !== null);

  return {
    films,
    page,
    totalPages: toNumber(data.totalPages ?? data.pagesCount) ?? 1
  };
}

function mapFilmDetails(raw: Record<string, unknown>): CachedFilm {
  const summary = mapFilmSummary(raw);
  if (!summary) {
    throw new Error("Kinopoisk API returned film without id");
  }

  return {
    ...summary,
    description: toStringValue(raw.description),
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
    rating: toStringValue(raw.rating ?? raw.ratingKinopoisk)
  };
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
