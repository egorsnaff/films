import { readLocalCache, writeLocalCache } from "./kpLocalCache";

export type KinopoiskFilm = {
  kinopoiskId: number;
  title: string;
  originalTitle?: string;
  year?: string;
  posterUrl?: string;
  rating?: string;
};

export type KinopoiskFilmDetails = KinopoiskFilm & {
  description?: string;
  countries?: string[];
  genres?: string[];
  filmLengthMinutes?: number;
};

export type KinopoiskCatalogPage = {
  films: KinopoiskFilm[];
  page: number;
  totalPages: number;
};

export type TopCollectionType =
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
  | "KIDS_ANIMATION_THEME";

type FetchLike = typeof fetch;

type KinopoiskClientOptions = {
  fetchImpl?: FetchLike;
  proxyBaseUrl?: string;
};

const PROXY_BASE =
  import.meta.env.VITE_SITE_API_BASE_URL?.replace(/\/+$/, "") || "/api";

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
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? `Kinopoisk proxy failed with status ${response.status}`);
    }

    return (await response.json()) as T;
  }

  async function getCachedCatalogPage(
    cacheKey: string,
    kind: "catalog" | "search" | "list",
    path: string
  ): Promise<KinopoiskCatalogPage> {
    const local = readLocalCache<KinopoiskCatalogPage>(cacheKey, kind);
    if (local) {
      return local;
    }

    const result = await proxyRequest<{ page: KinopoiskCatalogPage }>(path);
    writeLocalCache(cacheKey, result.page);
    return result.page;
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
        `/search?${params.toString()}`
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
        `/catalog/recent?${params.toString()}`
      );
    },

    async getTopFilms(type: TopCollectionType, page = 1): Promise<KinopoiskCatalogPage> {
      const params = new URLSearchParams({
        type,
        page: String(page)
      });

      return getCachedCatalogPage(`top:${type}:${page}`, "list", `/top?${params.toString()}`);
    },

    async getThemeFilms(type: ThemeCollectionType, page = 1): Promise<KinopoiskCatalogPage> {
      const params = new URLSearchParams({
        type,
        page: String(page)
      });

      return getCachedCatalogPage(
        `theme:${type}:${page}`,
        "list",
        `/collections?${params.toString()}`
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
    }
  };
}
