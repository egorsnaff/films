import { createCatalogFilter, type CatalogFilter } from "../lib/catalogFilter";

export const IMDB_FILMS_SHELF_TITLE = "250 лучших, которые вы ещё не смотрели (IMDb)";
export const IMDB_SERIALS_SHELF_TITLE = "250 лучших сериалов, которые вы ещё не смотрели (IMDb)";

export function createImdbFilmsTopFilter(): CatalogFilter {
  return createCatalogFilter({
    title: IMDB_FILMS_SHELF_TITLE,
    kind: "top",
    media: "films",
    topType: "IMDB_TOP_250"
  });
}

export function createImdbSerialsTopFilter(): CatalogFilter {
  return createCatalogFilter({
    title: IMDB_SERIALS_SHELF_TITLE,
    kind: "top",
    media: "serials",
    topType: "IMDB_TOP_250_TV"
  });
}
