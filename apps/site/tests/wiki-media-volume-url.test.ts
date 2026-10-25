// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { publicEntityUrl } from "../src/lib/wiki-entity-model";

test("native volume revalidation follows an existing legacy reader identity", () => {
  expect(publicEntityUrl("media_volumes", { id: 1, legacyVolumeId: 82 })).toBe(
    "/wiki/manga/volume/82",
  );
  expect(publicEntityUrl("media_volumes", { id: 45, legacyVolumeId: null })).toBeNull();
  expect(publicEntityUrl("media_volumes", { id: 45 })).toBeNull();
  expect(publicEntityUrl("media_volumes", { id: 45, legacyVolumeId: -1 })).toBeNull();
  expect(publicEntityUrl("media_volumes", { id: 45, legacyVolumeId: "../82" })).toBeNull();
});
