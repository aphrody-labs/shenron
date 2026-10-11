// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { createNativeWebPort } from "../src/web";
import type { NativeCommandExecutor } from "@aphrody/shenron-pipeline/aphrody/native-commands";

test("A failed native probe disables the Web group", async () => {
  const executor: NativeCommandExecutor = async () => ({ code: 1, stdout: "", stderr: "missing" });
  expect(await createNativeWebPort(executor)).toBeNull();
});

test("The Bun owner advertises only compiled in-process operations", async () => {
  const calls: string[][] = [];
  const executor: NativeCommandExecutor = async (args) => {
    calls.push([...args]);
    return {
      code: 0,
      stderr: "",
      stdout:
        args[0] === "--version"
          ? "aphrody 0.3.0"
          : args[1] === "--help"
            ? "Commands:\n  frames  Frame index\n  media   Media resolver"
            : JSON.stringify({
                path: "/private/frames.sqlite",
                media: 2,
                frames: 4,
                durationMs: 20,
              }),
    };
  };
  const owner = await createNativeWebPort(executor);
  expect(owner).not.toBeNull();
  expect(await owner!.status()).toEqual({
    version: "aphrody 0.3.0",
    capabilities: ["frames-stats", "media-resolve"],
  });
  expect(owner!.framesVector).toBeUndefined();
  expect(owner!.framesSearch).toBeUndefined();
  expect(owner!.mediaSearch).toBeUndefined();
  expect((await owner!.framesStats!()).frames).toBe(4);
  expect(calls[2]).toEqual(["web", "frames", "stats", "--json"]);
});
