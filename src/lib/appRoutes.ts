import type { CatalogFilter } from "./catalogFilter";
import { parseCatalogFilterId } from "./catalogFilter";
import type { CatalogMode, LegacyMenuItem, NavigationSnapshot } from "./navigation";

export type LocationLike = {
  pathname: string;
  search: string;
};

function normalizeBasePath(value?: string): string {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "/") {
    return "/";
  }

  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

export function getAppBasePath(base = import.meta.env.BASE_URL): string {
  return normalizeBasePath(base);
}

function stripBasePath(pathname: string, basePath: string): string {
  if (basePath === "/") {
    return pathname.startsWith("/") ? pathname : `/${pathname}`;
  }

  const prefix = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
  if (pathname === prefix || pathname === `${prefix}/`) {
    return "/";
  }

  if (pathname.startsWith(`${prefix}/`)) {
    return pathname.slice(prefix.length) || "/";
  }

  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

function joinAppPath(basePath: string, relativePath: string): string {
  const relative = relativePath.replace(/^\/+/, "");
  if (!relative) {
    return basePath === "/" ? "/" : basePath;
  }

  if (basePath === "/") {
    return `/${relative}`;
  }

  return `${basePath}${relative}`;
}

function parsePositiveInt(value: string | null, fallback = 1): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

function catalogMenuForMode(mode: CatalogMode, filter: CatalogFilter | null): LegacyMenuItem {
  if (mode === "serials" || filter?.media === "serials") {
    return "Сериалы";
  }

  if (mode === "filtered") {
    return "Каталог";
  }

  return "Фильмы";
}

export function buildAppPathname(
  snapshot: NavigationSnapshot,
  basePath = getAppBasePath()
): string {
  if (snapshot.view === "watch" && snapshot.filmId) {
    return joinAppPath(basePath, `watch/${snapshot.filmId}`);
  }

  if (snapshot.view === "browse") {
    return joinAppPath(basePath, "browse");
  }

  if (snapshot.view === "profile") {
    return joinAppPath(basePath, "profile");
  }

  if (snapshot.view === "catalog") {
    if (snapshot.catalogMode === "serials") {
      return joinAppPath(basePath, "serials");
    }

    if (snapshot.catalogMode === "search") {
      return joinAppPath(basePath, "search");
    }

    if (snapshot.catalogMode === "filtered" && snapshot.catalogFilter?.id) {
      return joinAppPath(basePath, `filter/${encodeURIComponent(snapshot.catalogFilter.id)}`);
    }
  }

  return joinAppPath(basePath, "");
}

export function buildAppSearch(snapshot: NavigationSnapshot): string {
  const params = new URLSearchParams();

  if (snapshot.view === "catalog" && snapshot.catalogMode === "search") {
    const query = snapshot.searchQuery?.trim();
    if (query) {
      params.set("q", query);
    }
  }

  if (
    snapshot.view === "catalog" &&
    snapshot.catalogMode !== "search" &&
    typeof snapshot.page === "number" &&
    snapshot.page > 1
  ) {
    params.set("page", String(snapshot.page));
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

export function buildAppUrl(
  snapshot: NavigationSnapshot,
  basePath = getAppBasePath()
): string {
  return `${buildAppPathname(snapshot, basePath)}${buildAppSearch(snapshot)}`;
}

export function buildWatchFilmUrl(
  filmId: number,
  basePath = getAppBasePath()
): string {
  return buildAppUrl(
    {
      ...createHomeSnapshot(),
      view: "watch",
      filmId
    },
    basePath
  );
}

export function createHomeSnapshot(scrollY = 0): NavigationSnapshot {
  return {
    view: "catalog",
    activeMenu: "Фильмы",
    catalogMode: "premieres",
    collectionId: null,
    filmId: null,
    searchQuery: "",
    browseMedia: "films",
    catalogFilter: null,
    page: 1,
    scrollY
  };
}

export function parseLocationToSnapshot(
  location: LocationLike,
  basePath = getAppBasePath()
): NavigationSnapshot {
  const relativePath = stripBasePath(location.pathname, basePath);
  const params = new URLSearchParams(location.search.startsWith("?") ? location.search : `?${location.search}`);
  const page = parsePositiveInt(params.get("page"), 1);
  const searchQuery = params.get("q")?.trim() ?? "";
  const segments = relativePath.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);

  if (segments[0] === "watch") {
    const filmId = Number.parseInt(segments[1] ?? "", 10);
    if (Number.isFinite(filmId) && filmId > 0) {
      return {
        ...createHomeSnapshot(),
        view: "watch",
        filmId,
        page: 1
      };
    }
  }

  if (segments[0] === "serials") {
    return {
      ...createHomeSnapshot(),
      view: "catalog",
      activeMenu: "Сериалы",
      catalogMode: "serials",
      browseMedia: "serials",
      page
    };
  }

  if (segments[0] === "search") {
    return {
      ...createHomeSnapshot(),
      view: "catalog",
      activeMenu: "Фильмы",
      catalogMode: "search",
      searchQuery,
      page: 1
    };
  }

  if (segments[0] === "filter" && segments[1]) {
    let filterId = segments.slice(1).join("/");
    try {
      filterId = decodeURIComponent(filterId);
    } catch {
      // keep raw segment if decoding fails
    }

    const catalogFilter = parseCatalogFilterId(filterId);
    if (catalogFilter) {
      return {
        ...createHomeSnapshot(),
        view: "catalog",
        activeMenu: catalogMenuForMode("filtered", catalogFilter),
        catalogMode: "filtered",
        browseMedia: catalogFilter.media,
        catalogFilter,
        page
      };
    }
  }

  if (segments[0] === "browse") {
    return {
      ...createHomeSnapshot(),
      view: "browse",
      activeMenu: "Каталог",
      catalogMode: "premieres",
      page: 1
    };
  }

  if (segments[0] === "profile") {
    return {
      ...createHomeSnapshot(),
      view: "profile",
      activeMenu: "Профиль",
      catalogMode: "premieres",
      page: 1
    };
  }

  return {
    ...createHomeSnapshot(),
    page: segments.length === 0 ? page : 1
  };
}

export function isSameAppUrl(
  left: NavigationSnapshot,
  right: NavigationSnapshot,
  basePath = getAppBasePath()
): boolean {
  return buildAppUrl(left, basePath) === buildAppUrl(right, basePath);
}

export function withSnapshotPage(
  snapshot: NavigationSnapshot,
  page: number
): NavigationSnapshot {
  return {
    ...snapshot,
    page: page > 1 ? page : 1
  };
}
