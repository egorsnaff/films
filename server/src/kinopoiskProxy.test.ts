import { describe, expect, it } from "vitest";

import {
  isFilmDetailsCacheComplete,
  mapFilmDetails,
  resolveCatalogTotalPages
} from "./kinopoiskProxy.js";

describe("resolveCatalogTotalPages", () => {
  it("uses explicit totalPages when provided", () => {
    expect(resolveCatalogTotalPages({ totalPages: 8, items: [] }, 2, 20)).toBe(8);
  });

  it("derives totalPages from total item count", () => {
    expect(resolveCatalogTotalPages({ total: 95, items: [] }, 1, 20)).toBe(5);
  });

  it("falls back to the current page when metadata is missing", () => {
    expect(resolveCatalogTotalPages({ items: [] }, 3, 20)).toBe(3);
  });
});

describe("mapFilmDetails", () => {
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
