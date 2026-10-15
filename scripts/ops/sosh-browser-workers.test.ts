// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { browserProvenance } from "./sosh-browser-workers";

test("browser provenance preserves CDP facts without inventing a native engine or provider", () => {
  const result = browserProvenance({
    product: "Chrome/143.0",
    jsVersion: "14.3",
    userAgent: "Chrome UA",
  });
  expect(result.engine).toBe("unknown");
  expect(result.browserVersion.product).toBe("Chrome/143.0");
  expect(result.browserVersion.jsVersion).toBe("14.3");
  expect(result.provider).toBe("unknown");
  expect(result.ownerReportedEngine).toBe("unknown");
  expect(browserProvenance({})).toMatchObject({ engine: "unknown", provider: "unknown" });
});
