import { describe, expect, it } from "vitest";

import {
  getTvSeriesCatalogTotalPages,
  resolveTvSeriesCatalogPage,
  TV_SERIES_KP_PAGES_PER_SEGMENT,
  TV_SERIES_YEAR_SEGMENTS
} from "./tvSeriesCatalog.js";

describe("tvSeriesCatalog", () => {
  it("maps early pages to the newest year segment", () => {
    expect(resolveTvSeriesCatalogPage(1)).toMatchObject({
      segmentIndex: 0,
      segmentPage: 1,
      yearFrom: 2024,
      yearTo: 2026
    });
    expect(resolveTvSeriesCatalogPage(5)).toMatchObject({
      segmentIndex: 0,
      segmentPage: 5,
      yearFrom: 2024,
      yearTo: 2026
    });
  });

  it("switches to the next year segment after five Kinopoisk pages", () => {
    expect(resolveTvSeriesCatalogPage(6)).toMatchObject({
      segmentIndex: 1,
      segmentPage: 1,
      yearFrom: 2022,
      yearTo: 2023
    });
  });

  it("exposes composite total pages across all segments", () => {
    expect(getTvSeriesCatalogTotalPages()).toBe(
      TV_SERIES_YEAR_SEGMENTS.length * TV_SERIES_KP_PAGES_PER_SEGMENT
    );
  });

  it("clamps pages beyond the configured segments", () => {
    const lastSegmentIndex = TV_SERIES_YEAR_SEGMENTS.length - 1;
    const beyond = getTvSeriesCatalogTotalPages() + 10;
    expect(resolveTvSeriesCatalogPage(beyond).segmentIndex).toBe(lastSegmentIndex);
  });
});
