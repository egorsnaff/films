import type { CatalogMode } from "./navigation";

export type CatalogPagePayload = {
  films: unknown[];
  page: number;
  totalPages: number;
};

export function isCatalogPageResponseValid(
  catalogPage: CatalogPagePayload,
  requestedPage: number
): boolean {
  if (catalogPage.films.length > 0) {
    return true;
  }

  if (requestedPage <= 1) {
    return true;
  }

  if (catalogPage.page < requestedPage) {
    return false;
  }

  return catalogPage.page >= catalogPage.totalPages;
}

export function resolveCatalogHasMore(
  catalogPage: CatalogPagePayload,
  requestedPage: number,
  mode: CatalogMode
): boolean {
  if (mode === "search") {
    return false;
  }

  if (!isCatalogPageResponseValid(catalogPage, requestedPage)) {
    return true;
  }

  return catalogPage.page < catalogPage.totalPages;
}
