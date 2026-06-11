import { describe, expect, it } from "vitest";

import { countVisibleFilms, mergeFilms } from "./catalogFeed";

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

  it("excludes recommendation ids from visible count", () => {
    const films = [
      { kinopoiskId: 1, title: "A", posterUrl: "https://example.test/a.jpg" },
      { kinopoiskId: 2, title: "B", posterUrl: "https://example.test/b.jpg" }
    ];

    expect(countVisibleFilms(films, "premieres", new Set([1]))).toBe(1);
  });
});
