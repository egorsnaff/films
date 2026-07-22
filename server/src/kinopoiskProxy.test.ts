import { describe, expect, it, vi } from "vitest";

import {
  bufferCatalogPage,
  isFilmDetailsCacheComplete,
  mapFilmDetails,
  resolveCatalogTotalPages,
  sortFilmsByImdbRating
} from "./kinopoiskProxy.js";

describe("bufferCatalogPage", () => {
  it("aggregates multiple source pages until the minimum displayable count is reached", async () => {
    const fetchPage = vi.fn(async (page: number) => ({
      films: [
        {
          kinopoiskId: page * 10 + 1,
          title: `With poster ${page}`,
          posterUrl: "https://example.test/poster.jpg"
        },
        {
          kinopoiskId: page * 10 + 2,
          title: `Without poster ${page}`
        }
      ],
      page,
      totalPages: 4
    }));

    const result = await bufferCatalogPage(fetchPage, 1, {
      minFilms: 3,
      maxFetches: 5,
      batchSize: 1
    });

    expect(result.films).toHaveLength(3);
    expect(result.page).toBe(3);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it("fetches source pages in parallel batches", async () => {
    const fetchPage = vi.fn(async (page: number) => ({
      films: [
        {
          kinopoiskId: page,
          title: `Film ${page}`,
          posterUrl: "https://example.test/poster.jpg"
        }
      ],
      page,
      totalPages: 6
    }));

    const result = await bufferCatalogPage(fetchPage, 1, { minFilms: 4, maxFetches: 6, batchSize: 4 });

    expect(result.films).toHaveLength(4);
    expect(fetchPage).toHaveBeenCalledTimes(4);
    expect(fetchPage.mock.calls.map(([page]) => page)).toEqual([1, 2, 3, 4]);
  });

  it("stops at the last available source page", async () => {
    const fetchPage = vi.fn(async (page: number) => ({
      films: [
        {
          kinopoiskId: page,
          title: `Film ${page}`,
          posterUrl: "https://example.test/poster.jpg"
        }
      ],
      page,
      totalPages: 2
    }));

    const result = await bufferCatalogPage(fetchPage, 1, {
      minFilms: 24,
      maxFetches: 10,
      batchSize: 1
    });

    expect(result.films).toHaveLength(2);
    expect(result.page).toBe(2);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage.mock.calls.map(([page]) => page)).toEqual([1, 2]);
  });

  it("loads later logical pages when startPage is greater than one", async () => {
    const fetchPage = vi.fn(async (page: number) => ({
      films: [
        {
          kinopoiskId: page * 10,
          title: `Film ${page}`,
          posterUrl: "https://example.test/poster.jpg"
        }
      ],
      page,
      totalPages: 8
    }));

    const result = await bufferCatalogPage(fetchPage, 5, { minFilms: 3, maxFetches: 4, batchSize: 4 });

    expect(result.films.map((film) => film.kinopoiskId)).toEqual([50, 60, 70]);
    expect(result.page).toBe(7);
    expect(result.totalPages).toBe(8);
    expect(fetchPage.mock.calls.map(([page]) => page)).toEqual([5, 6, 7, 8]);
  });
});

describe("resolveCatalogTotalPages", () => {
  it("uses explicit totalPages when provided", () => {
    expect(resolveCatalogTotalPages({ totalPages: 8, items: [] }, 2, 20)).toBe(8);
  });

  it("derives totalPages from total item count", () => {
    expect(resolveCatalogTotalPages({ total: 95, items: [] }, 1, 20)).toBe(5);
  });

  it("assumes another page exists when a full page is returned without metadata", () => {
    expect(resolveCatalogTotalPages({ items: [] }, 3, 20)).toBe(4);
  });

  it("treats a partial page as the last page when metadata is missing", () => {
    expect(resolveCatalogTotalPages({ items: [] }, 5, 12)).toBe(5);
  });

  it("steps back when an empty page is returned without metadata", () => {
    expect(resolveCatalogTotalPages({ items: [] }, 6, 0)).toBe(5);
  });
});

describe("mapFilmDetails", () => {
  it("prefers full posterUrl over preview thumbnails", () => {
    expect(
      mapFilmDetails({
        kinopoiskId: 346,
        nameRu: "12 разгневанных мужчин",
        posterUrl: "https://example.test/posters/kp/346.jpg",
        posterUrlPreview: "https://example.test/posters/kp_small/346.jpg"
      }).posterUrl
    ).toBe("https://example.test/posters/kp/346.jpg");
  });

  it("maps description and shortDescription from Kinopoisk film payload", () => {
    expect(
      mapFilmDetails({
        kinopoiskId: 361,
        nameRu: "Бойцовский клуб",
        description: "Терзаемый хронической бессонницей..."
      }).description
    ).toContain("бессонниц");

    expect(
      mapFilmDetails({
        filmId: 361,
        nameRu: "Бойцовский клуб",
        shortDescription: "Краткое описание бойцовского клуба"
      }).description
    ).toBe("Краткое описание бойцовского клуба");

    expect(
      mapFilmDetails({
        filmId: 326,
        nameRu: "Побег из Шоушенка",
        ratingKinopoisk: 9.1,
        ratingImdb: 9.3
      }).imdbRating
    ).toBe("9.3");
  });
});

describe("sortFilmsByImdbRating", () => {
  it("orders films by imdb rating descending", () => {
    expect(
      sortFilmsByImdbRating([
        { kinopoiskId: 1, title: "A", imdbRating: "7.1" },
        { kinopoiskId: 2, title: "B", imdbRating: "8.8" },
        { kinopoiskId: 3, title: "C", imdbRating: "8.2" }
      ]).map((film) => film.kinopoiskId)
    ).toEqual([2, 3, 1]);
  });
});

describe("isFilmDetailsCacheComplete", () => {
  it("treats catalog-only cache entries as incomplete", () => {
    expect(
      isFilmDetailsCacheComplete({
        kinopoiskId: 361,
        title: "Бойцовский клуб",
        rating: "8.6"
      })
    ).toBe(false);
  });

  it("treats detailed cache entries as complete", () => {
    expect(
      isFilmDetailsCacheComplete({
        kinopoiskId: 361,
        title: "Бойцовский клуб",
        description: "Описание"
      })
    ).toBe(true);
  });
});
