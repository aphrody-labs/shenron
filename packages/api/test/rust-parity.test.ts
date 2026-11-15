// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { record } from "../scripts/api-fixtures";

// The golden cases the Rust router replays (crates/shenron-api/tests/parity.rs) are still what the
// TypeScript host answers: a change of the host must re-record them (scripts/api-fixtures.ts).
test("data/api/fixtures match createShenronApi", async () => {
  expect(await record(false)).toEqual([]);
});
