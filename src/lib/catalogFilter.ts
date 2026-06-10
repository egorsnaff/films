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
