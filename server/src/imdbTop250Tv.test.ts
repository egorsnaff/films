import { describe, expect, it } from "vitest";

import {
  getImdbTop250TvKinopoiskIds,
  getImdbTop250TvTotalPages,
  IMDB_TOP_250_TV_PAGE_SIZE,
  loadImdbTop250TvManifest
} from "./imdbTop250Tv.js";

describe("imdbTop250Tv manifest", () => {
  it("loads 250 ranked entries with unique kinopoisk ids", () => {
    const manifest = loadImdbTop250TvManifest();

    expect(manifest.entries).toHaveLength(250);
    expect(manifest.entries[0]?.rank).toBe(1);
    expect(manifest.entries[0]?.title).toBe("Breaking Bad");
    expect(manifest.entries[0]?.imdbId).toBe("tt0903747");
    expect(manifest.entries[0]?.kinopoiskId).toBe(404900);

    const ids = getImdbTop250TvKinopoiskIds();
    expect(ids).toHaveLength(250);
    expect(new Set(ids).size).toBeGreaterThanOrEqual(249);
    expect(getImdbTop250TvTotalPages()).toBe(Math.ceil(250 / IMDB_TOP_250_TV_PAGE_SIZE));
  });
});
