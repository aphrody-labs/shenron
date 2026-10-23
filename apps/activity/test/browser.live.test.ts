// SPDX-License-Identifier: Apache-2.0
/**
 * Live: plays a round in a real headless Chrome at 1280 and 390 px (scripts/browser-check.ts).
 * Excluded from `bun test` (`*.live.test.ts`); run with `SHENRON_ACTIVITY_BROWSER=1 bun test test/browser.live.test.ts`.
 */
import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findChrome } from "../scripts/browser";
import { runBrowserCheck } from "../scripts/browser-check";

test.skipIf(process.env.SHENRON_ACTIVITY_BROWSER !== "1" || !findChrome())(
  "the Activity plays a whole round in Chrome without overflow, errors or missing images",
  async () => {
    const out = mkdtempSync(join(tmpdir(), "activity-shots-"));
    try {
      const result = await runBrowserCheck({ outDir: out });
      expect(result.problems).toEqual([]);
      expect(result.shots.length).toBeGreaterThanOrEqual(14);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  },
  180_000,
);
