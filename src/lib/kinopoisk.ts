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
};

type FetchLike = typeof fetch;

type KinopoiskClientOptions = {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
};

type SearchFilmResponse = {
  films?: Array<Record<string, unknown>>;
  items?: Array<Record<string, unknown>>;
};

const DEFAULT_BASE_URL = "https://kinopoiskapiunofficial.tech/api";

export function hasValidPosterUrl(posterUrl?: string): boolean {
  const trimmed = posterUrl?.trim();

  if (!trimmed) {
    return false;
  }

  return !trimmed.toLowerCase().includes("no-poster");
}

export function createKinopoiskClient({
  apiKey,
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl = fetch
}: KinopoiskClientOptions) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");

  async function request<T>(path: string): Promise<T> {
    if (!apiKey.trim()) {
      throw new Error("Kinopoisk API key is not configured");
    }

    const response = await fetchImpl(`${normalizedBaseUrl}${path}`, {
      headers: {
        Accept: "application/json",
        "X-API-KEY": apiKey
      }
    });

    if (!response.ok) {
      throw new Error(`Kinopoisk API request failed with status ${response.status}`);
    }

    return (await response.json()) as T;
  }

  return {
    async searchFilms(keyword: string, page = 1): Promise<KinopoiskFilm[]> {
      const trimmedKeyword = keyword.trim();

      if (!trimmedKeyword) {
        return [];
      }

      const params = new URLSearchParams({
        keyword: trimmedKeyword,
        page: String(page)
      });
      const data = await request<SearchFilmResponse>(
        `/v2.1/films/search-by-keyword?${params.toString()}`
      );
      const films = data.films ?? data.items ?? [];

      return films.map(mapFilmSummary).filter(isFilm);
    },

    async getRecentFilms(page = 1): Promise<KinopoiskFilm[]> {
      const params = new URLSearchParams({
        order: "YEAR",
        type: "FILM",
        ratingFrom: "6",
        ratingTo: "10",
        yearFrom: "2024",
        yearTo: "2026",
        page: String(page)
      });
      const data = await request<SearchFilmResponse>(`/v2.2/films?${params.toString()}`);
      const films = data.items ?? data.films ?? [];

      return films.map(mapFilmSummary).filter(isFilm);
    },

    async getFilm(kinopoiskId: number): Promise<KinopoiskFilmDetails> {
      const data = await request<Record<string, unknown>>(`/v2.2/films/${kinopoiskId}`);

      return mapFilmDetails(data);
    }
  };
}

function mapFilmSummary(raw: Record<string, unknown>): KinopoiskFilm | null {
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

function mapFilmDetails(raw: Record<string, unknown>): KinopoiskFilmDetails {
  const summary = mapFilmSummary(raw);

  if (!summary) {
    throw new Error("Kinopoisk API returned film details without an id");
  }

  return {
    ...summary,
    description: toStringValue(raw.description),
    countries: mapNamedList(raw.countries),
    genres: mapNamedList(raw.genres)
  };
}

function mapNamedList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const names = value
    .map((item) =>
      typeof item === "object" && item !== null ? toStringValue(item.name) : undefined
    )
    .filter((item): item is string => Boolean(item));

  return names.length > 0 ? names : undefined;
}

function isFilm(value: KinopoiskFilm | null): value is KinopoiskFilm {
  return value !== null;
}

function normalizePosterUrl(value: unknown): string | undefined {
  const posterUrl = toStringValue(value);

  return hasValidPosterUrl(posterUrl) ? posterUrl : undefined;
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
