import { describe, expect, it } from "vitest";

import {
  addUserFilmToList,
  db,
  resolveAutoListMemberships,
  resolveProgressStatus
} from "./db.js";

describe("addUserFilmToList", () => {
  const userId = 990_001;
  const kinopoiskId = 990_101;

  const cleanup = () => {
    db.prepare("DELETE FROM user_film_memberships WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM user_film_progress WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  };

  it("keeps watching and watched mutually exclusive", () => {
    cleanup();
    db.prepare(
      "INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, '', ?)"
    ).run(userId, `test-user-${userId}`, new Date().toISOString());
    try {
      addUserFilmToList(userId, kinopoiskId, "favorite");
      addUserFilmToList(userId, kinopoiskId, "watching");
      expect(addUserFilmToList(userId, kinopoiskId, "watched").lists.sort()).toEqual([
        "favorite",
        "watched"
      ]);
      expect(addUserFilmToList(userId, kinopoiskId, "watching").lists.sort()).toEqual([
        "favorite",
        "watching"
      ]);
    } finally {
      cleanup();
    }
  });
});

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
