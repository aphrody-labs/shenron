// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { createVideoRecovery } from "../src/lib/video-recovery";

test("dead HLS sources exhaust recovery and release the player fallback", () => {
  const recover = createVideoRecovery();
  expect(recover("network")).toBe("network");
  expect(recover("network")).toBe("network");
  expect(recover("network")).toBe("fail");
  expect(recover("media")).toBe("media");
  expect(recover("media")).toBe("fail");
  expect(recover("other")).toBe("fail");
  expect(createVideoRecovery()("network")).toBe("network");
});
