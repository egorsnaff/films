import { describe, expect, it } from "vitest";

import { createCatalogFilter } from "./catalogFilter";

describe("createCatalogFilter", () => {
  it("builds stable ids for genre filters", () => {
    expect(
      createCatalogFilter({
        title: "Драмы",
        kind: "genre",
        media: "films",
        genreId: 8
      }).id
    ).toBe("genre:films:8");
  });
});
