import { describe, expect, it } from "vitest";

import { parsePlayerProgressMessage } from "./playerProgress";

describe("parsePlayerProgressMessage", () => {
  it("parses Alloha timeupdate JSON messages", () => {
    expect(parsePlayerProgressMessage(JSON.stringify({ event: "timeupdate", time: 3720 }))).toEqual({
      currentTime: 3720
    });
  });

  it("parses player.js timeupdate payloads", () => {
    expect(
      parsePlayerProgressMessage(
        JSON.stringify({
          context: "player.js",
          event: "timeupdate",
          value: { seconds: 95, duration: 5400 }
        })
      )
    ).toEqual({
      currentTime: 95,
      duration: 5400
    });
  });

  it("parses Kodik progress messages", () => {
    expect(
      parsePlayerProgressMessage(JSON.stringify({ key: "kodik_player_time_update", value: 125 }))
    ).toEqual({
      currentTime: 125
    });
  });

  it("parses Kodik ended messages", () => {
    expect(
      parsePlayerProgressMessage(
        JSON.stringify({ key: "kodik_player_media_ended", value: 5400, duration: 5400 })
      )
    ).toEqual({
      currentTime: 5400,
      duration: 5400,
      ended: true
    });
  });

  it("parses YouTube infoDelivery messages", () => {
    expect(
      parsePlayerProgressMessage(
        JSON.stringify({
          event: "infoDelivery",
          info: { currentTime: 42, duration: 120 }
        })
      )
    ).toEqual({
      currentTime: 42,
      duration: 120
    });
  });

  it("parses ended events", () => {
    expect(parsePlayerProgressMessage(JSON.stringify({ event: "ended", duration: 5400 }))).toEqual({
      currentTime: 5400,
      duration: 5400,
      ended: true
    });
  });
});
