import { describe, expect, it } from "vitest";

import {
  countVisibleFilms,
  getAdaptiveSkeletonCount,
  getScrollPrefetchThreshold,
  mergeFilms,
  shouldShowCatalogSkeletons
} from "./catalogFeed";

describe("catalogFeed", () => {
  it("merges films without duplicates", () => {
    const current = [{ kinopoiskId: 1, title: "A" }];
    const next = [
      { kinopoiskId: 1, title: "A" },
      { kinopoiskId: 2, title: "B" }
    ];

    expect(mergeFilms(current, next).map((film) => film.kinopoiskId)).toEqual([1, 2]);
  });

  it("counts only visible posters outside search mode", () => {
    const films = [
      { kinopoiskId: 1, title: "A", posterUrl: "https://example.test/a.jpg" },
      { kinopoiskId: 2, title: "B", posterUrl: "https://kinopoiskapiunofficial.tech/images/posters/kp/no-poster.png" }
    ];

    expect(countVisibleFilms(films, "films")).toBe(1);
    expect(countVisibleFilms(films, "search")).toBe(2);
  });

  it("prefetches earlier on tall viewports", () => {
    expect(getScrollPrefetchThreshold(900)).toBe(2475);
    expect(getScrollPrefetchThreshold(500)).toBe(1800);
  });

  it("fills at least three skeleton rows for the current viewport", () => {
    expect(getAdaptiveSkeletonCount(1200)).toBeGreaterThanOrEqual(12);
    expect(getAdaptiveSkeletonCount(768)).toBe(12);
  });

  it("shows skeletons while loading or near the end of the feed", () => {
    expect(
      shouldShowCatalogSkeletons({
        catalogMode: "premieres",
        hasMore: true,
        isLoadingMore: false,
        nearEnd: true,
        hasUserScrolled: true
      })
    ).toBe(true);

    expect(
      shouldShowCatalogSkeletons({
        catalogMode: "premieres",
        hasMore: true,
        isLoadingMore: false,
        nearEnd: true,
        hasUserScrolled: false
      })
    ).toBe(false);

    expect(
      shouldShowCatalogSkeletons({
        catalogMode: "search",
        hasMore: true,
        isLoadingMore: true,
        nearEnd: true,
        hasUserScrolled: true
      })
    ).toBe(false);
  });

  it("excludes recommendation ids from visible count", () => {
    const films = [
      { kinopoiskId: 1, title: "A", posterUrl: "https://example.test/a.jpg" },
      { kinopoiskId: 2, title: "B", posterUrl: "https://example.test/b.jpg" }
    ];

    expect(countVisibleFilms(films, "premieres", new Set([1]))).toBe(1);
  });
});
