import { describe, expect, it } from "vitest";

import { createPresenceStore, parsePresenceActivity, PRESENCE_TTL_MS } from "./presence.js";

const users = [
  { id: 1, username: "egor" },
  { id: 2, username: "leha" },
  { id: 3, username: "kseniya" }
];

const watching = { kind: "watching" as const, kinopoiskId: 111543, title: "Темный рыцарь" };

function createClock() {
  let current = 1_000_000;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    }
  };
}

describe("parsePresenceActivity", () => {
  it("accepts known activities and drops unexpected fields", () => {
    expect(parsePresenceActivity({ kind: "searching", query: "секрет" })).toEqual({
      kind: "searching"
    });
    expect(
      parsePresenceActivity({ ...watching, posterUrl: "https://example.test/p.jpg", extra: 1 })
    ).toEqual({ ...watching, posterUrl: "https://example.test/p.jpg" });
  });

  it("rejects invalid payloads", () => {
    expect(parsePresenceActivity({ kind: "hacking" })).toBeNull();
    expect(parsePresenceActivity({ kind: "watching", kinopoiskId: "x", title: "A" })).toBeNull();
    expect(parsePresenceActivity({ kind: "watching", kinopoiskId: 1, title: " " })).toBeNull();
    expect(
      parsePresenceActivity({ ...watching, posterUrl: "javascript:alert(1)" })
    ).toEqual(watching);
  });
});

describe("createPresenceStore", () => {
  it("lists other users with online ones first and hides the viewer", () => {
    const clock = createClock();
    const store = createPresenceStore(clock.now);
    store.update(3, "tab-a", { kind: "catalog" }, true);

    expect(store.list(users, 1)).toEqual([
      { id: 3, username: "kseniya", online: true, activity: { kind: "catalog" } },
      { id: 2, username: "leha", online: false }
    ]);
  });

  it("prefers a tab that is playing a film over newer activity in other tabs", () => {
    const clock = createClock();
    const store = createPresenceStore(clock.now);
    store.update(2, "player", watching, false);
    clock.advance(1_000);
    store.update(2, "browse", { kind: "searching" }, true);

    expect(store.resolve(2)).toEqual(watching);
  });

  it("shows the most recently changed visible tab and away when all tabs are hidden", () => {
    const clock = createClock();
    const store = createPresenceStore(clock.now);
    store.update(2, "a", { kind: "catalog" }, true);
    clock.advance(1_000);
    store.update(2, "b", { kind: "profile" }, true);
    clock.advance(1_000);
    store.update(2, "a", { kind: "catalog" }, true);

    expect(store.resolve(2)).toEqual({ kind: "profile" });

    store.update(2, "a", { kind: "catalog" }, false);
    store.update(2, "b", { kind: "profile" }, false);
    expect(store.resolve(2)).toEqual({ kind: "away" });
  });

  it("goes offline after the TTL or when the last tab leaves", () => {
    const clock = createClock();
    const store = createPresenceStore(clock.now);
    store.update(2, "a", { kind: "catalog" }, true);
    clock.advance(PRESENCE_TTL_MS + 1);
    expect(store.resolve(2)).toBeUndefined();

    store.update(2, "a", { kind: "catalog" }, true);
    store.leave(2, "a");
    expect(store.resolve(2)).toBeUndefined();
  });
});
