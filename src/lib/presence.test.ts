import { describe, expect, it } from "vitest";

import { describePresence, resolveLocalActivity } from "./presence";

const film = { kinopoiskId: 111543, title: "Темный рыцарь", posterUrl: "https://example.test/p.jpg" };

describe("resolveLocalActivity", () => {
  it("reports the film only once the player is actually playing", () => {
    expect(
      resolveLocalActivity({ view: "watch", catalogMode: "premieres", film, playbackStarted: true })
    ).toEqual({ kind: "watching", ...film });
    expect(
      resolveLocalActivity({ view: "watch", catalogMode: "premieres", film, playbackStarted: false })
    ).toEqual({ kind: "choosing" });
  });

  it("maps other views to short statuses", () => {
    const base = { film: null, playbackStarted: false };
    expect(resolveLocalActivity({ ...base, view: "catalog", catalogMode: "search" })).toEqual({
      kind: "searching"
    });
    expect(resolveLocalActivity({ ...base, view: "profile", catalogMode: "premieres" })).toEqual({
      kind: "profile"
    });
    expect(resolveLocalActivity({ ...base, view: "collections", catalogMode: "premieres" })).toEqual({
      kind: "catalog"
    });
  });
});

describe("describePresence", () => {
  it("labels online and offline users", () => {
    expect(describePresence({ id: 2, username: "leha", online: false })).toBe("не в сети");
    expect(
      describePresence({ id: 2, username: "leha", online: true, activity: { kind: "away" } })
    ).toBe("отошёл");
    expect(
      describePresence({
        id: 2,
        username: "leha",
        online: true,
        activity: { kind: "watching", kinopoiskId: 1, title: "A" }
      })
    ).toBe("смотрит");
  });
});
