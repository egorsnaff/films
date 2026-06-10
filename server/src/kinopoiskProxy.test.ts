import { describe, expect, it } from "vitest";

import { resolveCatalogTotalPages } from "./kinopoiskProxy.js";

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
