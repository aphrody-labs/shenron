// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { registryUrl } from "./sync-source-status";
test("registry identities cannot introduce query strings or alternate hosts", () => {
  expect(registryUrl("npm", "@aphrody/shenron-api", "1.4.4")).toBe(
    "https://registry.npmjs.org/%40aphrody%2Fshenron-api/1.4.4",
  );
  expect(registryUrl("crate", "shenron-re", "1.4.4?token=private")).toBe(
    "https://crates.io/api/v1/crates/shenron-re/1.4.4%3Ftoken%3Dprivate",
  );
  expect(() => registryUrl("npm", "", "1.4.4")).toThrow("Registry identity");
});
