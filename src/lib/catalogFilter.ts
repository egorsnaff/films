import type { ThemeCollectionType, TopCollectionType } from "./kinopoisk";

export type BrowseMedia = "films" | "serials";

export type CatalogFilterKind =
  | "genre"
  | "country"
  | "year"
  | "theme"
  | "top"
  | "serialCategory";

export type CatalogFilter = {
  id: string;
  title: string;
  kind: CatalogFilterKind;
  media: BrowseMedia;
  genreId?: number;
  countryId?: number;
  year?: number;
  themeType?: ThemeCollectionType;
  topType?: TopCollectionType;
};

export type KinopoiskFilterGenre = {
  id: number;
  genre: string;
};

export type KinopoiskFilterCountry = {
  id: number;
  country: string;
};

export type KinopoiskFilters = {
  genres: KinopoiskFilterGenre[];
  countries: KinopoiskFilterCountry[];
};

export function getCatalogFilterMediaType(filter: CatalogFilter): "FILM" | "TV_SERIES" {
  return filter.media === "serials" ? "TV_SERIES" : "FILM";
}

export function buildCatalogFilterId(filter: Omit<CatalogFilter, "id" | "title"> & { title?: string }): string {
  if (filter.kind === "theme" && filter.themeType) {
    return `theme:${filter.themeType}`;
  }

  if (filter.kind === "top" && filter.topType) {
    return `top:${filter.topType}`;
  }

  if (filter.kind === "genre" && filter.genreId) {
    return `genre:${filter.media}:${filter.genreId}`;
  }

  if (filter.kind === "country" && filter.countryId) {
    return `country:${filter.media}:${filter.countryId}`;
  }

  if (filter.kind === "year" && filter.year) {
    return `year:${filter.media}:${filter.year}`;
  }

  if (filter.kind === "serialCategory") {
    if (filter.genreId) {
      return `serial:genre:${filter.genreId}`;
    }

    if (filter.countryId) {
      return `serial:country:${filter.countryId}`;
    }

    return "serial:all";
  }

  return `filter:${filter.kind}:${filter.media}`;
}

export function createCatalogFilter(
  input: Omit<CatalogFilter, "id"> & { id?: string }
): CatalogFilter {
  return {
    ...input,
    id: input.id ?? buildCatalogFilterId(input)
  };
}

const THEME_TITLES: Partial<Record<ThemeCollectionType, string>> = {
  VAMPIRE_THEME: "Вампиры",
  ZOMBIE_THEME: "Зомби",
  LOVE_THEME: "Про любовь",
  COMICS_THEME: "По комиксам",
  FAMILY: "Семейные",
  CATASTROPHE_THEME: "Катастрофы",
  KIDS_ANIMATION_THEME: "Мультфильмы",
  CLOSES_RELEASES: "Скоро в прокате",
  TOP_POPULAR_ALL: "Популярное",
  TOP_POPULAR_MOVIES: "Популярные фильмы",
  TOP_POPULAR_SERIES: "Популярные сериалы"
};

const TOP_TITLES: Partial<Record<TopCollectionType, string>> = {
  IMDB_TOP_250: "250 лучших фильмов (IMDb)",
  IMDB_TOP_250_TV: "250 лучших сериалов (IMDb)",
  TOP_250_BEST_FILMS: "250 лучших фильмов",
  TOP_100_POPULAR_FILMS: "Топ по популярности",
  TOP_AWAIT_FILMS: "Самые ожидаемые"
};

function isBrowseMedia(value: string): value is BrowseMedia {
  return value === "films" || value === "serials";
}

function parsePositiveId(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

/** Reconstruct a CatalogFilter from a stable id like `genre:films:8`. */
export function parseCatalogFilterId(filterId: string): CatalogFilter | null {
  const id = filterId.trim();
  if (!id) {
    return null;
  }

  const parts = id.split(":");
  const [kind, second, third] = parts;

  if (kind === "theme" && second) {
    const themeType = second as ThemeCollectionType;
    return createCatalogFilter({
      id,
      title: THEME_TITLES[themeType] ?? themeType,
      kind: "theme",
      media: themeType.includes("SERIES") ? "serials" : "films",
      themeType
    });
  }

  if (kind === "top" && second) {
    const topType = second as TopCollectionType;
    const media: BrowseMedia = topType === "IMDB_TOP_250_TV" ? "serials" : "films";
    return createCatalogFilter({
      id,
      title: TOP_TITLES[topType] ?? topType,
      kind: "top",
      media,
      topType
    });
  }

  if (kind === "genre" && second && third) {
    if (!isBrowseMedia(second)) {
      return null;
    }
    const genreId = parsePositiveId(third);
    if (!genreId) {
      return null;
    }
    return createCatalogFilter({
      id,
      title: `Жанр ${genreId}`,
      kind: "genre",
      media: second,
      genreId
    });
  }

  if (kind === "country" && second && third) {
    if (!isBrowseMedia(second)) {
      return null;
    }
    const countryId = parsePositiveId(third);
    if (!countryId) {
      return null;
    }
    return createCatalogFilter({
      id,
      title: `Страна ${countryId}`,
      kind: "country",
      media: second,
      countryId
    });
  }

  if (kind === "year" && second && third) {
    if (!isBrowseMedia(second)) {
      return null;
    }
    const year = parsePositiveId(third);
    if (!year) {
      return null;
    }
    return createCatalogFilter({
      id,
      title: String(year),
      kind: "year",
      media: second,
      year
    });
  }

  if (kind === "serial") {
    if (second === "all") {
      return createCatalogFilter({
        id,
        title: "Все сериалы",
        kind: "serialCategory",
        media: "serials"
      });
    }

    if (second === "genre") {
      const genreId = parsePositiveId(third);
      if (!genreId) {
        return null;
      }
      return createCatalogFilter({
        id,
        title: `Жанр ${genreId}`,
        kind: "serialCategory",
        media: "serials",
        genreId
      });
    }

    if (second === "country") {
      const countryId = parsePositiveId(third);
      if (!countryId) {
        return null;
      }
      return createCatalogFilter({
        id,
        title: `Страна ${countryId}`,
        kind: "serialCategory",
        media: "serials",
        countryId
      });
    }
  }

  return null;
}
