import { describe, expect, it } from "vitest";

import {
  addUserFilmToList,
  createUser,
  db,
  ensureInitialAdmins,
  findUserById,
  listSharedPlanFilmIds,
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

  it("keeps plan and watched mutually exclusive", () => {
    cleanup();
    db.prepare(
      "INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, '', ?)"
    ).run(userId, `test-user-${userId}`, new Date().toISOString());
    try {
      addUserFilmToList(userId, kinopoiskId, "plan");
      expect(addUserFilmToList(userId, kinopoiskId, "watched").lists).toEqual(["watched"]);
      expect(addUserFilmToList(userId, kinopoiskId, "plan").lists).toEqual(["plan"]);
    } finally {
      cleanup();
    }
  });
});

describe("listSharedPlanFilmIds", () => {
  const usernames = ["shared-test-a", "shared-test-b", "shared-test-c"];

  const cleanup = () => {
    db.prepare(
      `DELETE FROM user_film_memberships
       WHERE user_id IN (SELECT id FROM users WHERE username IN (?, ?, ?))`
    ).run(...usernames);
    db.prepare("DELETE FROM users WHERE username IN (?, ?, ?)").run(...usernames);
  };

  it("merges plan lists of the given users without duplicates", () => {
    cleanup();
    try {
      const [first, second, outsider] = usernames.map((name) => createUser(name, "hash"));
      addUserFilmToList(first.id, 980_001, "plan");
      addUserFilmToList(second.id, 980_002, "plan");
      addUserFilmToList(second.id, 980_001, "plan");
      addUserFilmToList(second.id, 980_003, "watched");
      addUserFilmToList(outsider.id, 980_004, "plan");

      expect(listSharedPlanFilmIds([first.username, second.username]).sort()).toEqual([
        980_001, 980_002
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

  it("never auto-marks series as watched", () => {
    expect(resolveAutoListMemberships([], 3000, 95, "watched", { isSeries: true })).toEqual([
      "watching"
    ]);
    expect(resolveAutoListMemberships(["watching"], 3000, 100, "watched", { isSeries: true })).toEqual(
      []
    );
    expect(resolveAutoListMemberships(["watched"], 3000, 95, undefined, { isSeries: true })).toEqual(
      []
    );
  });
});

describe("ensureInitialAdmins", () => {
  const username = "initial-admin-test";
  const cleanup = () => db.prepare("DELETE FROM users WHERE username = ?").run(username);

  it("promotes only the listed users", () => {
    cleanup();
    try {
      const user = createUser(username, "");
      expect(user.is_admin).toBe(0);

      ensureInitialAdmins(["someone-else"]);
      expect(findUserById(user.id)?.is_admin).toBe(0);

      ensureInitialAdmins([username]);
      expect(findUserById(user.id)?.is_admin).toBe(1);
    } finally {
      cleanup();
    }
  });
});

describe("signup_requests table", () => {
  it("has the expected columns", () => {
    const columns = db.prepare("PRAGMA table_info(signup_requests)").all() as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).toEqual([
      "id",
      "email",
      "password_hash",
      "status",
      "created_at",
      "decided_at",
      "decided_by"
    ]);
  });
});
