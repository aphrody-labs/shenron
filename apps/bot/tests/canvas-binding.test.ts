// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configureCanvasBinding } from "../src/lib/canvas-binding";

const directories: string[] = [];
afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("compiled bot native canvas binding", () => {
  test.each(["linux", "win32"])("uses the actual executable directory for %s", async (platform) => {
    const directory = mkdtempSync(join(tmpdir(), "shenron-canvas-binding-"));
    directories.push(directory);
    const addon = join(
      directory,
      platform === "linux" ? "skia.linux-x64-gnu.node" : "skia.win32-x64-msvc.node",
    );
    await Bun.write(addon, "fixture");
    const env: Record<string, string | undefined> = {};
    expect(
      await configureCanvasBinding(env, {
        compiled: true,
        execPath: join(directory, "shenron-bot"),
        platform,
        arch: "x64",
      }),
    ).toBe(addon);
    expect(env.NAPI_RS_NATIVE_LIBRARY_PATH).toBe(addon);
  });
  test("preserves an explicit operator binding and leaves source execution untouched", async () => {
    const override = { NAPI_RS_NATIVE_LIBRARY_PATH: "operator-addon.node" };
    expect(await configureCanvasBinding(override, { compiled: true })).toBe("operator-addon.node");
    const source: Record<string, string | undefined> = {};
    expect(await configureCanvasBinding(source, { compiled: false })).toBeNull();
    expect(source.NAPI_RS_NATIVE_LIBRARY_PATH).toBeUndefined();
  });
  test("does not configure a missing addon or an unsupported distribution target", async () => {
    const directory = mkdtempSync(join(tmpdir(), "shenron-canvas-binding-"));
    directories.push(directory);
    const env: Record<string, string | undefined> = {};
    expect(
      await configureCanvasBinding(env, {
        compiled: true,
        execPath: join(directory, "shenron-bot"),
        platform: "linux",
        arch: "x64",
      }),
    ).toBeNull();
    expect(await configureCanvasBinding(env, { compiled: true, platform: "unknown" })).toBeNull();
    expect(env.NAPI_RS_NATIVE_LIBRARY_PATH).toBeUndefined();
  });
});
