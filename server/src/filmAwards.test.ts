import { describe, expect, it } from "vitest";

import { aggregateFilmAwards } from "./filmAwards.js";

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
});
