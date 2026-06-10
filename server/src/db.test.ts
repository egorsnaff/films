import { describe, expect, it } from "vitest";

import { resolveAutoListMemberships, resolveProgressStatus } from "./db.js";

describe("resolveProgressStatus", () => {
  const existingPlan = {
    user_id: 1,
    kinopoisk_id: 301,
    status: "plan" as const,
    watch_seconds: 0,
    progress_percent: 0,
    updated_at: "2026-01-01T00:00:00.000Z"
  };

  it("does not auto-add watching before five minutes", () => {
    expect(resolveProgressStatus(existingPlan, 120, 1, "watching")).toBeNull();
    expect(resolveProgressStatus(undefined, 120, 1, "watching")).toBeNull();
  });

  it("switches to watching after five minutes", () => {
    expect(resolveProgressStatus(existingPlan, 300, 2)).toBe("watching");
    expect(resolveProgressStatus(undefined, 300, 2)).toBe("watching");
  });

  it("marks watched at ninety percent regardless of elapsed time", () => {
    expect(resolveProgressStatus(undefined, 10, 90)).toBe("watched");
    expect(resolveProgressStatus(existingPlan, 10, 90, "watched")).toBe("watched");
  });
});

describe("resolveAutoListMemberships", () => {
  it("adds memberships without removing existing lists", () => {
    expect(resolveAutoListMemberships(["plan", "favorite"], 300, 2)).toEqual(["watching"]);
    expect(resolveAutoListMemberships(["plan", "watching"], 300, 2)).toEqual([]);
    expect(resolveAutoListMemberships(["plan"], 10, 95)).toEqual(["watched"]);
  });
});
