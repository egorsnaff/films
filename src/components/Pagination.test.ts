import { describe, expect, it } from "vitest";

import { getPaginationItems } from "./Pagination";

describe("getPaginationItems", () => {
  it("lists every page when there are few", () => {
    expect(getPaginationItems(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("collapses distant pages into gaps", () => {
    expect(getPaginationItems(1, 19)).toEqual([1, 2, 3, 4, "gap", 19]);
    expect(getPaginationItems(10, 19)).toEqual([1, "gap", 9, 10, 11, "gap", 19]);
    expect(getPaginationItems(19, 19)).toEqual([1, "gap", 16, 17, 18, 19]);
  });
});
