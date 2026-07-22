import { describe, expect, it } from "vitest";

import { createCatalogFilter, parseCatalogFilterId } from "./catalogFilter";

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

describe("parseCatalogFilterId", () => {
  it("round-trips genre, top and serial filters", () => {
    expect(parseCatalogFilterId("genre:films:8")).toMatchObject({
      id: "genre:films:8",
      kind: "genre",
      media: "films",
      genreId: 8
    });

    expect(parseCatalogFilterId("top:IMDB_TOP_250")).toMatchObject({
      kind: "top",
      media: "films",
      topType: "IMDB_TOP_250"
    });

    expect(parseCatalogFilterId("serial:all")).toMatchObject({
      kind: "serialCategory",
      media: "serials"
    });

    expect(parseCatalogFilterId("year:serials:2020")).toMatchObject({
      kind: "year",
      media: "serials",
      year: 2020
    });
  });

  it("returns null for unknown ids", () => {
    expect(parseCatalogFilterId("")).toBeNull();
    expect(parseCatalogFilterId("nope")).toBeNull();
    expect(parseCatalogFilterId("genre:films:abc")).toBeNull();
  });
});
