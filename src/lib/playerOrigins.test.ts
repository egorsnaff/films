import { describe, expect, it } from "vitest";

import { isAllowedPlayerMessageOrigin } from "./playerOrigins";

describe("isAllowedPlayerMessageOrigin", () => {
  it("accepts messages from the iframe origin", () => {
    expect(
      isAllowedPlayerMessageOrigin(
        "https://kinohost.web.app",
        "https://kinohost.web.app/embed/301"
      )
    ).toBe(true);
  });

  it("accepts messages from known nested player hosts", () => {
    expect(
      isAllowedPlayerMessageOrigin(
        "https://harald-as.newplayjj.com",
        "https://kinohost.web.app/embed/301"
      )
    ).toBe(true);
  });

  it("rejects unknown origins", () => {
    expect(
      isAllowedPlayerMessageOrigin("https://evil.example", "https://kinohost.web.app/embed/301")
    ).toBe(false);
  });
});
