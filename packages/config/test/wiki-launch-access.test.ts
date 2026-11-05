// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { findEntry, isPathPublic, type AccessMode } from "../src/wiki-launch";

test("arc indexes and detail routes inherit saga publication", () => {
  for (const path of ["/wiki/arcs", "/wiki/arcs/red-ribbon"]) {
    expect(findEntry(path)?.key).toBe("sagas");
    expect(isPathPublic(path, { openKeys: [] })).toBe(false);
    expect(isPathPublic(path, { openKeys: ["sagas"] })).toBe(true);
  }
});

test("opening sagas does not bypass a stored audience restriction for arcs", () => {
  for (const mode of ["members", "roles", "admin"] satisfies AccessMode[]) {
    expect(
      isPathPublic("/wiki/arcs/red-ribbon", {
        openKeys: ["sagas"],
        access: { sagas: { mode, roleIds: mode === "roles" ? ["staff-role"] : [] } },
      }),
    ).toBe(false);
  }
});

test("arc route registration does not open unknown neighboring prefixes", () => {
  expect(findEntry("/wiki/arcs-unpublished")).toBeUndefined();
  expect(isPathPublic("/wiki/arcs-unpublished", { openKeys: ["sagas"] })).toBe(false);
});

test("the GIF library inherits the public episode policy, without opening adjacent routes", () => {
  expect(findEntry("/wiki/gifs")?.key).toBe("episodes");
  expect(isPathPublic("/wiki/gifs", { openKeys: [] })).toBe(true);
  expect(isPathPublic("/wiki/gifs-unpublished", { openKeys: [] })).toBe(false);
});
