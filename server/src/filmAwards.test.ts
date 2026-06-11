import { describe, expect, it } from "vitest";

import {
  aggregateFilmAwards,
  attachCachedAwardChipsToFilms,
  readCachedFilmAwardChips
} from "./filmAwards.js";
import { readCache, writeCache } from "./kpCache.js";

describe("aggregateFilmAwards", () => {
  it("groups awards by ceremony and year with wins first", () => {
    const payload = aggregateFilmAwards([
      {
        name: "Оскар",
        win: false,
        nominationName: "Лучший звук",
        year: 2004,
        imageUrl: "https://example.test/oscar.png"
      },
      {
        name: "Оскар",
        win: true,
        nominationName: "Лучший фильм",
        year: 2004,
        persons: [{ nameRu: "Питер Джексон" }]
      },
      {
        name: "Золотой глобус",
        win: true,
        nominationName: "Лучший режиссер",
        year: 2004,
        persons: [{ nameRu: "Питер Джексон" }]
      }
    ]);

    expect(payload.total).toBe(3);
    expect(payload.summary).toEqual([
      {
        name: "Оскар",
        wins: 1,
        nominations: 1,
        imageUrl: "https://example.test/oscar.png"
      },
      {
        name: "Золотой глобус",
        wins: 1,
        nominations: 0,
        imageUrl: undefined
      }
    ]);
    expect(payload.groups[0]?.name).toBe("Оскар");
    expect(payload.groups[0]?.items.map((item) => item.nominationName)).toEqual([
      "Лучший фильм",
      "Лучший звук"
    ]);
    expect(payload.groups[0]?.items[0]?.persons).toEqual(["Питер Джексон"]);
  });

  it("returns empty payload for no items", () => {
    expect(aggregateFilmAwards([])).toEqual({
      total: 0,
      summary: [],
      groups: []
    });
  });

  it("reads cached award chips without extra API calls", () => {
    writeCache(`awards:3498`, {
      total: 11,
      summary: [
        { name: "Оскар", wins: 11, nominations: 0, imageUrl: "https://example.test/oscar.png" },
        { name: "Сатурн", wins: 2, nominations: 1 }
      ],
      groups: []
    });

    expect(readCachedFilmAwardChips(3498)).toEqual([
      { name: "Оскар", wins: 11, imageUrl: "https://example.test/oscar.png" },
      { name: "Сатурн", wins: 2, imageUrl: undefined }
    ]);
    expect(readCachedFilmAwardChips(999999)).toBeUndefined();
    expect(readCache(`awards:3498`, "awards")).not.toBeNull();
  });

  it("attaches cached chips only to films with awards in cache", () => {
    writeCache(`awards:42`, {
      total: 1,
      summary: [{ name: "Оскар", wins: 1, nominations: 0 }],
      groups: []
    });

    const films = attachCachedAwardChipsToFilms([
      { kinopoiskId: 42, title: "Awarded" },
      { kinopoiskId: 7, title: "Plain" }
    ]);

    expect(films[0]?.awardChips).toEqual([{ name: "Оскар", wins: 1, imageUrl: undefined }]);
    expect(films[1]?.awardChips).toBeUndefined();
  });
});
