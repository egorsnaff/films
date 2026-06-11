import { describe, expect, it } from "vitest";

import {
  getImdbTop250KinopoiskIds,
  getImdbTop250TotalPages,
  IMDB_TOP_250_PAGE_SIZE,
  loadImdbTop250Manifest
} from "./imdbTop250.js";

describe("imdbTop250 manifest", () => {
  it("loads 250 ranked entries with unique kinopoisk ids", () => {
    const manifest = loadImdbTop250Manifest();

    expect(manifest.entries).toHaveLength(250);
    expect(manifest.entries[0]?.rank).toBe(1);
    expect(manifest.entries[0]?.title).toBe("Побег из Шоушенка");
    expect(manifest.entries[0]?.kinopoiskId).toBe(326);

    const ids = getImdbTop250KinopoiskIds();
    expect(ids).toHaveLength(250);
    expect(new Set(ids).size).toBe(250);
    expect(getImdbTop250TotalPages()).toBe(Math.ceil(250 / IMDB_TOP_250_PAGE_SIZE));
  });
});
