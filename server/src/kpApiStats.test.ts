import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "films-kp-stats-"));

describe("kpApiStats", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.DATABASE_PATH = path.join(tempDir, `stats-${Date.now()}.db`);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("counts total and daily Kinopoisk API calls", async () => {
    const { getKinopoiskApiStats, recordKinopoiskApiCall } = await import("./kpApiStats.js");

    recordKinopoiskApiCall();
    recordKinopoiskApiCall();

    expect(getKinopoiskApiStats()).toMatchObject({
      totalCalls: 2,
      todayCalls: 2
    });
  });
});
