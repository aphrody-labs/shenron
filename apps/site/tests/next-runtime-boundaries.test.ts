// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import config from "../next.config";

test("Next transpiles browser SDK source while deferring the native Yolo entry to Bun", async () => {
  const resolved = await config("phase-production-build", {});
  expect(resolved.serverExternalPackages).toContain("@aphrody/bun-runtime-sdk/yolo");
  expect(resolved.serverExternalPackages).not.toContain("@aphrody/bun-runtime-sdk");
  expect(resolved.transpilePackages).toContain("@aphrody/bun-runtime-sdk");
  expect(resolved.typescript?.ignoreBuildErrors).not.toBe(true);
});

test("the SDK browser HLS adapter compiles without native runtime dependencies", async () => {
  const result = await Bun.build({
    entrypoints: [Bun.resolveSync("@aphrody/bun-runtime-sdk/video/hls", import.meta.dir)],
    target: "browser",
  });
  expect(result.success).toBe(true);
  const emitted = await result.outputs[0]!.text();
  expect(emitted).toContain("attachHlsPlayback");
  expect(emitted).not.toContain("bun:yolo");
  expect(emitted).not.toContain("bun:ffi");
});
