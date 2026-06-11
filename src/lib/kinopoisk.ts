import { isCatalogPageResponseValid } from "./catalogPage";
import { readLocalCache, writeLocalCache } from "./kpLocalCache";

export type KinopoiskFilm = {
  kinopoiskId: number;
  title: string;
  originalTitle?: string;
  year?: string;
  posterUrl?: string;
  rating?: string;
  imdbRating?: string;
};

export type KinopoiskFilmDetails = KinopoiskFilm & {
  description?: string;
  countries?: string[];
  genres?: string[];
  filmLengthMinutes?: number;
};

export type FilmAwardItem = {
  nominationName: string;
  win: boolean;
  persons: string[];
};

export type FilmAwardGroup = {
  name: string;
  year: number;
  imageUrl?: string;
  wins: number;
  nominations: number;
  items: FilmAwardItem[];
};

export type FilmAwardSummaryChip = {
  name: string;
  wins: number;
  nominations: number;
  imageUrl?: string;
};

export type FilmAwardsPayload = {
  total: number;
  summary: FilmAwardSummaryChip[];
  groups: FilmAwardGroup[];
};

export type KinopoiskCatalogPage = {
  films: KinopoiskFilm[];
  page: number;
  totalPages: number;
};

export type TopCollectionType =
  | "IMDB_TOP_250"
  | "IMDB_TOP_250_TV"
  | "TOP_250_BEST_FILMS"
  | "TOP_100_POPULAR_FILMS"
  | "TOP_AWAIT_FILMS";

export type ThemeCollectionType =
  | "VAMPIRE_THEME"
  | "ZOMBIE_THEME"
  | "LOVE_THEME"
  | "COMICS_THEME"
  | "FAMILY"
  | "CATASTROPHE_THEME"
  | "KIDS_ANIMATION_THEME"
  | "CLOSES_RELEASES"
  | "TOP_POPULAR_ALL"
  | "TOP_POPULAR_MOVIES"
  | "TOP_POPULAR_SERIES";

export type FilterCatalogQuery = {
  type: "FILM" | "TV_SERIES";
  genreId?: number;
  countryId?: number;
  year?: number;
  order?: "RATING" | "YEAR" | "NUM_VOTE";
};

export type KinopoiskFiltersPayload = {
  genres: Array<{ id: number; genre: string }>;
  countries: Array<{ id: number; country: string }>;
};

type FetchLike = typeof fetch;

type KinopoiskClientOptions = {
  fetchImpl?: FetchLike;
  proxyBaseUrl?: string;
};

const PROXY_BASE =
  import.meta.env.VITE_SITE_API_BASE_URL?.replace(/\/+$/, "") || "/api";

const CLIENT_CATALOG_PAGE_CACHE_VERSION = "v2";

export function hasValidPosterUrl(posterUrl?: string): boolean {
  const trimmed = posterUrl?.trim();

  if (!trimmed) {
    return false;
  }

  return !trimmed.toLowerCase().includes("no-poster");
}

export function createKinopoiskClient({
  fetchImpl = fetch,
  proxyBaseUrl = PROXY_BASE
}: KinopoiskClientOptions = {}) {
  const proxyBase = proxyBaseUrl.replace(/\/+$/, "");

  async function proxyRequest<T>(path: string): Promise<T> {
    const response = await fetchImpl(`${proxyBase}/kp${path}`, {
      credentials: "include",
      headers: { Accept: "application/json" }
    });

    if (!response.ok) {
      let payload: { error?: string } | null = null;
      let rawBody = "";

      try {
        payload = (await response.json()) as { error?: string };
      } catch {
        if (typeof response.text === "function") {
          rawBody = await response.text().catch(() => "");
        }
      }

      if (payload?.error) {
        throw new Error(payload.error);
      }

      if (response.status === 502 || response.status === 503) {
        const fallback =
          response.status === 503
            ? "Сервер не смог связаться с Kinopoisk API. Проверьте KINOPOISK_API_KEY на сервере и перезапустите контейнер api."
            : "Kinopoisk API временно недоступен. Попробуйте обновить страницу чуть позже.";

        throw new Error(rawBody.trim() || fallback);
      }

      throw new Error(
        rawBody.trim() || `Kinopoisk proxy failed with status ${response.status}`
      );
    }

    return (await response.json()) as T;
  }

  async function getCachedCatalogPage(
    cacheKey: string,
    kind: "catalog" | "search" | "list",
    path: string,
    requestedPage: number
  ): Promise<KinopoiskCatalogPage> {
    const versionedKey = `${CLIENT_CATALOG_PAGE_CACHE_VERSION}:${cacheKey}`;
    const local = readLocalCache<KinopoiskCatalogPage>(versionedKey, kind);
    if (local && isCatalogPageResponseValid(local, requestedPage)) {
      return local;
    }

    const result = await proxyRequest<{ page: KinopoiskCatalogPage }>(path);
    const page = result.page;

    if (isCatalogPageResponseValid(page, requestedPage)) {
      writeLocalCache(versionedKey, page);
    }

    return page;
  }

  return {
    async searchFilms(keyword: string, page = 1): Promise<KinopoiskCatalogPage> {
      const trimmedKeyword = keyword.trim();
      if (!trimmedKeyword) {
        return { films: [], page: 1, totalPages: 1 };
      }

      const params = new URLSearchParams({
        keyword: trimmedKeyword,
        page: String(page)
      });

      return getCachedCatalogPage(
        `search:${trimmedKeyword.toLowerCase()}:${page}`,
        "search",
        `/search?${params.toString()}`,
        page
      );
    },

    async getRecentFilms(page = 1, type: "FILM" | "TV_SERIES" = "FILM"): Promise<KinopoiskCatalogPage> {
      const params = new URLSearchParams({
        type,
        page: String(page)
      });

      return getCachedCatalogPage(
        `catalog:recent:${type}:${page}`,
        "catalog",
        `/catalog/recent?${params.toString()}`,
        page
      );
    },

    async getTopFilms(type: TopCollectionType, page = 1): Promise<KinopoiskCatalogPage> {
      const params = new URLSearchParams({
        type,
        page: String(page)
      });

      return getCachedCatalogPage(
        `top:${type}:${page}`,
        "list",
        `/top?${params.toString()}`,
        page
      );
    },

    async getFilters(): Promise<KinopoiskFiltersPayload> {
      const local = readLocalCache<KinopoiskFiltersPayload>("filters:metadata", "list");
      if (local) {
        return local;
      }

      const result = await proxyRequest<KinopoiskFiltersPayload>("/filters");
      writeLocalCache("filters:metadata", result);
      return result;
    },

    async getFilteredFilms(
      query: FilterCatalogQuery,
      page = 1
    ): Promise<KinopoiskCatalogPage> {
      const params = new URLSearchParams({
        type: query.type,
        page: String(page),
        order: query.order ?? "RATING"
      });

      if (query.genreId) {
        params.set("genreId", String(query.genreId));
      }

      if (query.countryId) {
        params.set("countryId", String(query.countryId));
      }

      if (query.year) {
        params.set("year", String(query.year));
      }

      const cacheKey = [
        "filter",
        query.type,
        query.genreId ?? "-",
        query.countryId ?? "-",
        query.year ?? "-",
        query.order ?? "RATING",
        page
      ].join(":");

      return getCachedCatalogPage(
        cacheKey,
        "catalog",
        `/catalog/filter?${params.toString()}`,
        page
      );
    },

    async getThemeFilms(type: ThemeCollectionType, page = 1): Promise<KinopoiskCatalogPage> {
      const params = new URLSearchParams({
        type,
        page: String(page)
      });

      return getCachedCatalogPage(
        `theme:${type}:${page}`,
        "list",
        `/collections?${params.toString()}`,
        page
      );
    },

    async getFilm(kinopoiskId: number): Promise<KinopoiskFilmDetails> {
      const local = readLocalCache<KinopoiskFilmDetails>(`film:${kinopoiskId}`, "film");
      if (local) {
        return local;
      }

      const result = await proxyRequest<{ film: KinopoiskFilmDetails }>(`/films/${kinopoiskId}`);
      writeLocalCache(`film:${kinopoiskId}`, result.film);
      return result.film;
    },

    async getSimilarFilms(kinopoiskId: number): Promise<KinopoiskFilm[]> {
      const cacheKey = `similars:${kinopoiskId}`;
      const local = readLocalCache<KinopoiskFilm[]>(cacheKey, "list");
      if (local) {
        return local;
      }

      const result = await proxyRequest<{ films?: KinopoiskFilm[] }>(
        `/films/${kinopoiskId}/similars`
      );
      const films = result.films ?? [];
      writeLocalCache(cacheKey, films);
      return films;
    },

    async getFilmAwards(kinopoiskId: number): Promise<FilmAwardsPayload> {
      const cacheKey = `awards:${kinopoiskId}`;
      const local = readLocalCache<FilmAwardsPayload>(cacheKey, "awards");
      if (local) {
        return local;
      }

      const result = await proxyRequest<{ awards: FilmAwardsPayload }>(
        `/films/${kinopoiskId}/awards`
      );
      writeLocalCache(cacheKey, result.awards);
      return result.awards;
    }
  };
}
