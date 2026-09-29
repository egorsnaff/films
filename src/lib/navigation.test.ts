import { describe, expect, it } from "vitest";

import { createHomeSnapshot } from "./appRoutes";
import { getBackLabel } from "./navigation";

describe("getBackLabel", () => {
  it("labels the way back to the admin page", () => {
    expect(getBackLabel({ ...createHomeSnapshot(), view: "admin" })).toBe("В админку");
  });
});
