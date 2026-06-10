import type { BrowseMedia, CatalogFilter, KinopoiskFilters } from "../lib/catalogFilter";
import { createCatalogFilter } from "../lib/catalogFilter";
import type { ThemeCollectionType, TopCollectionType } from "../lib/kinopoisk";

import { filmCollections } from "./collections";

export type BrowseSection = {
  id: string;
  title: string;
  items: CatalogFilter[];
};

const FILM_THEME_EXTRAS: Array<{ type: ThemeCollectionType; title: string }> = [
  { type: "TOP_POPULAR_MOVIES", title: "Популярные фильмы" },
  { type: "CLOSES_RELEASES", title: "Скоро в прокате" },
  { type: "KIDS_ANIMATION_THEME", title: "Мультфильмы" }
];

const FILM_TOP_ITEMS: Array<{ type: TopCollectionType; title: string }> = [
  { type: "TOP_250_BEST_FILMS", title: "250 лучших фильмов" },
  { type: "TOP_100_POPULAR_FILMS", title: "Топ по популярности" },
  { type: "TOP_AWAIT_FILMS", title: "Скоро в кино" }
];

const SERIAL_THEME_ITEMS: Array<{ type: ThemeCollectionType; title: string }> = [
  { type: "TOP_POPULAR_SERIES", title: "Популярные сериалы" },
  { type: "FAMILY", title: "Семейные сериалы" },
  { type: "KIDS_ANIMATION_THEME", title: "Мультсериалы" }
];

const RECENT_YEARS = 20;

function buildThemeItems(
  media: BrowseMedia,
  entries: Array<{ type: ThemeCollectionType; title: string }>
): CatalogFilter[] {
  return entries.map((entry) =>
    createCatalogFilter({
      title: entry.title,
      kind: "theme",
      media,
      themeType: entry.type
    })
  );
}

function buildTopItems(media: BrowseMedia): CatalogFilter[] {
  return FILM_TOP_ITEMS.map((entry) =>
    createCatalogFilter({
      title: entry.title,
      kind: "top",
      media,
      topType: entry.type
    })
  );
}

function buildGenreItems(
  media: BrowseMedia,
  genres: KinopoiskFilters["genres"]
): CatalogFilter[] {
  return [...genres]
    .sort((left, right) => left.genre.localeCompare(right.genre, "ru"))
    .map((genre) =>
      createCatalogFilter({
        title: genre.genre,
        kind: "genre",
        media,
        genreId: genre.id
      })
    );
}

function buildCountryItems(
  media: BrowseMedia,
  countries: KinopoiskFilters["countries"]
): CatalogFilter[] {
  return [...countries]
    .sort((left, right) => left.country.localeCompare(right.country, "ru"))
    .map((country) =>
      createCatalogFilter({
        title: country.country,
        kind: "country",
        media,
        countryId: country.id
      })
    );
}

function buildYearItems(media: BrowseMedia): CatalogFilter[] {
  const currentYear = new Date().getFullYear();
  const items: CatalogFilter[] = [];

  for (let offset = 0; offset < RECENT_YEARS; offset += 1) {
    const year = currentYear - offset;
    items.push(
      createCatalogFilter({
        title: String(year),
        kind: "year",
        media,
        year
      })
    );
  }

  return items;
}

function buildFilmSections(filters: KinopoiskFilters): BrowseSection[] {
  const collectionThemes = filmCollections.flatMap((collection) => {
    if (collection.source.kind !== "theme") {
      return [];
    }

    return [
      {
        type: collection.source.type,
        title: collection.title
      }
    ];
  });

  const themeItems = buildThemeItems("films", [...FILM_THEME_EXTRAS, ...collectionThemes]);

  return [
    {
      id: "themes",
      title: "Подборки",
      items: themeItems
    },
    {
      id: "tops",
      title: "Топы",
      items: buildTopItems("films")
    },
    {
      id: "genres",
      title: "Жанры",
      items: buildGenreItems("films", filters.genres)
    },
    {
      id: "years",
      title: "Годы",
      items: buildYearItems("films")
    },
    {
      id: "countries",
      title: "Страны",
      items: buildCountryItems("films", filters.countries)
    }
  ];
}

function buildSerialSections(filters: KinopoiskFilters): BrowseSection[] {
  const categoryItems: CatalogFilter[] = [
    createCatalogFilter({
      title: "Все сериалы",
      kind: "serialCategory",
      media: "serials"
    }),
    ...buildThemeItems("serials", SERIAL_THEME_ITEMS)
  ];

  return [
    {
      id: "categories",
      title: "Категории",
      items: categoryItems
    },
    {
      id: "genres",
      title: "Жанры",
      items: buildGenreItems("serials", filters.genres)
    },
    {
      id: "countries",
      title: "Страны",
      items: buildCountryItems("serials", filters.countries)
    }
  ];
}

export function buildBrowseSections(media: BrowseMedia, filters: KinopoiskFilters): BrowseSection[] {
  if (media === "serials") {
    return buildSerialSections(filters);
  }

  return buildFilmSections(filters);
}
