import { describe, expect, it } from "vitest";

import { isAuthGateEnabled } from "./authGate";

describe("isAuthGateEnabled", () => {
  it("is disabled in test mode", () => {
    expect(isAuthGateEnabled()).toBe(false);
  });
});
