import { describe, expect, it } from "vitest";

import { isCatalogPageResponseValid, resolveCatalogHasMore } from "./catalogPage";

describe("catalogPage", () => {
  it("rejects stale empty responses that did not advance the page", () => {
    expect(
      isCatalogPageResponseValid(
        {
          films: [],
          page: 1,
          totalPages: 1
        },
        3
      )
    ).toBe(false);
  });

  it("accepts empty terminal pages", () => {
    expect(
      isCatalogPageResponseValid(
        {
          films: [],
          page: 35,
          totalPages: 35
        },
        35
      )
    ).toBe(true);
  });

  it("keeps hasMore true for invalid stale responses", () => {
    expect(
      resolveCatalogHasMore(
        {
          films: [],
          page: 1,
          totalPages: 1
        },
        5,
        "films"
      )
    ).toBe(true);
  });

  it("stops at the reported last page for valid responses", () => {
    expect(
      resolveCatalogHasMore(
        {
          films: [{ kinopoiskId: 1 }],
          page: 35,
          totalPages: 35
        },
        35,
        "films"
      )
    ).toBe(false);
  });
});
