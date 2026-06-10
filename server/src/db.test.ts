import { describe, expect, it } from "vitest";

import { resolveProgressStatus } from "./db.js";

describe("resolveProgressStatus", () => {
  const existingPlan = {
    user_id: 1,
    kinopoisk_id: 301,
    status: "plan" as const,
    watch_seconds: 0,
    progress_percent: 0,
    updated_at: "2026-01-01T00:00:00.000Z"
  };

  it("keeps existing status when watch time is under five minutes", () => {
    expect(resolveProgressStatus(existingPlan, 120, 1, "watching")).toBe("plan");
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
