import { describe, expect, it } from "vitest";

import { buildBrowseSections } from "./browseSections";

const sampleFilters = {
  genres: [
    { id: 8, genre: "драмы" },
    { id: 6, genre: "комедии" }
  ],
  countries: [
    { id: 1, country: "США" },
    { id: 2, country: "Россия" }
  ]
};

describe("buildBrowseSections", () => {
  it("builds film sections with genres, tops and years", () => {
    const sections = buildBrowseSections("films", sampleFilters);

    expect(sections.map((section) => section.id)).toEqual([
      "themes",
      "tops",
      "genres",
      "years",
      "countries"
    ]);
    expect(sections[2]?.items.map((item) => item.title)).toEqual(["драмы", "комедии"]);
    expect(sections[3]?.items[0]?.kind).toBe("year");
    expect(sections[1]?.items.some((item) => item.topType === "TOP_250_BEST_FILMS")).toBe(true);
  });

  it("builds serial sections with categories and genres", () => {
    const sections = buildBrowseSections("serials", sampleFilters);

    expect(sections.map((section) => section.id)).toEqual(["categories", "genres", "countries"]);
    expect(sections[0]?.items[0]).toMatchObject({
      title: "Все сериалы",
      kind: "serialCategory",
      media: "serials"
    });
    expect(sections[1]?.items.map((item) => item.title)).toEqual(["драмы", "комедии"]);
  });
});
