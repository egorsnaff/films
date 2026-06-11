import type { CatalogMode } from "./navigation";
import { hasValidPosterUrl, type KinopoiskFilm } from "./kinopoisk";

export const MIN_VISIBLE_BUFFER = 12;
export const SCROLL_PREFETCH_VIEWPORTS = 1.25;
export const MIN_SCROLL_PREFETCH_PX = 900;
export const MIN_CATALOG_LOAD_INTERVAL_MS = 450;
export const MAX_AUTO_BUFFER_LOADS = 4;
export const GRID_COLUMN_MIN_PX = 172;
export const SKELETON_ROWS = 3;
export const MIN_LOAD_MORE_SKELETON_COUNT = 12;

export function mergeFilms(current: KinopoiskFilm[], next: KinopoiskFilm[]): KinopoiskFilm[] {
  const seen = new Set(current.map((film) => film.kinopoiskId));
  const uniqueNext = next.filter((film) => {
    if (seen.has(film.kinopoiskId)) {
      return false;
    }

    seen.add(film.kinopoiskId);
    return true;
  });

  return [...current, ...uniqueNext];
}

export function countVisibleFilms(
  films: KinopoiskFilm[],
  mode: CatalogMode,
  excludeIds: ReadonlySet<number> = new Set()
): number {
  const candidates =
    mode === "search"
      ? films
      : films.filter((film) => hasValidPosterUrl(film.posterUrl));

  if (excludeIds.size === 0) {
    return candidates.length;
  }

  return candidates.filter((film) => !excludeIds.has(film.kinopoiskId)).length;
}

export function getDistanceToBottom(): number {
  return document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
}

export function getScrollPrefetchThreshold(
  viewportHeight = typeof window === "undefined" ? 800 : window.innerHeight
): number {
  return Math.max(MIN_SCROLL_PREFETCH_PX, Math.round(viewportHeight * SCROLL_PREFETCH_VIEWPORTS));
}

export function shouldPrefetchByScroll(
  threshold = getScrollPrefetchThreshold()
): boolean {
  return getDistanceToBottom() < threshold;
}

export function getAdaptiveSkeletonCount(
  viewportWidth = typeof window === "undefined" ? 1200 : window.innerWidth
): number {
  const columns = Math.max(2, Math.floor(viewportWidth / GRID_COLUMN_MIN_PX));
  return Math.max(MIN_LOAD_MORE_SKELETON_COUNT, columns * SKELETON_ROWS);
}

export function shouldShowCatalogSkeletons({
  catalogMode,
  hasMore,
  isLoadingMore,
  nearEnd
}: {
  catalogMode: CatalogMode;
  hasMore: boolean;
  isLoadingMore: boolean;
  nearEnd: boolean;
}): boolean {
  if (catalogMode === "search" || !hasMore) {
    return false;
  }

  if (isLoadingMore) {
    return true;
  }

  if (!nearEnd) {
    return false;
  }

  if (typeof document === "undefined") {
    return true;
  }

  return document.documentElement.scrollHeight > window.innerHeight + 120;
}
