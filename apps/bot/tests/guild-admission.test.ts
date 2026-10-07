// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { admittedGuildIds } from "../src/lib/guild-admission";

const production = "934894610545770506";
const lab = "1554189180030947338";

test("retains the explicit lab guild on invitation and reconnect", () => {
  const allowed = admittedGuildIds(production, [lab, lab]);
  expect(allowed.has(production)).toBe(true);
  expect(allowed.has(lab)).toBe(true);
  expect(allowed.size).toBe(2);
  expect(allowed.has("100000000000000001")).toBe(false);
});

test("defaults to production only and rejects malformed allowlists", () => {
  expect(admittedGuildIds(production).has(lab)).toBe(false);
  expect(() => admittedGuildIds(production, ["*"])).toThrow();
  expect(() => admittedGuildIds("", [lab])).toThrow();
});
