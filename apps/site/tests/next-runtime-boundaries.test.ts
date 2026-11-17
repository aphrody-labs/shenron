// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import config from "../next.config";

test("Next keeps native modules outside the server bundle and checks types", async () => {
  const resolved = await config("phase-production-build", {});
  expect(resolved.serverExternalPackages).toContain("@aphrody/shenron-native");
  expect(resolved.serverExternalPackages).not.toContain("@aphrody/shenron-decision");
  expect(resolved.typescript?.ignoreBuildErrors).not.toBe(true);
});

test("the browser HLS adapter compiles without native runtime dependencies", async () => {
  const result = await Bun.build({
    entrypoints: [Bun.resolveSync("@aphrody/shenron-video/hls", import.meta.dir)],
    target: "browser",
  });
  expect(result.success).toBe(true);
  const emitted = await result.outputs[0]!.text();
  expect(emitted).toContain("attachHlsPlayback");
  expect(emitted).not.toContain("bun:ffi");
});
