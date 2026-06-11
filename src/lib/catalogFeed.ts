import type { CatalogMode } from "./navigation";
import { hasValidPosterUrl, type KinopoiskFilm } from "./kinopoisk";

export const MIN_VISIBLE_BUFFER = 12;
export const SCROLL_PREFETCH_PX = 1200;
export const LOAD_MORE_SKELETON_COUNT = 8;

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

export function shouldPrefetchByScroll(threshold = SCROLL_PREFETCH_PX): boolean {
  return getDistanceToBottom() < threshold;
}
