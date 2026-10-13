import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { syncUiAssets } from "../../packages/ui/scripts/sync-assets";
import { uiAssetPaths } from "../../packages/ui/src/assets";

const target = await mkdtemp(join(tmpdir(), "shenron-ui-assets-"));
afterAll(() => rm(target, { recursive: true, force: true }));

test("release preparation includes canonical icons and artwork without replacing unrelated assets", async () => {
  await Bun.write(join(target, "unrelated.txt"), "preserved");
  expect(await syncUiAssets(target)).toEqual({
    count: uiAssetPaths.length,
    mismatches: uiAssetPaths.length,
  });
  for (const name of uiAssetPaths) {
    const expected = await Bun.file(
      resolve(import.meta.dir, "../../packages/ui/assets", name),
    ).bytes();
    expect(await Bun.file(join(target, name)).bytes()).toEqual(expected);
  }
  expect(await Bun.file(join(target, "unrelated.txt")).text()).toBe("preserved");
  expect(await syncUiAssets(target, true)).toEqual({ count: uiAssetPaths.length, mismatches: 0 });
  await Bun.write(join(target, "favicon.ico"), "invalid");
  expect((await syncUiAssets(target, true)).mismatches).toBe(1);
  expect(await Bun.file(join(target, "favicon.ico")).text()).toBe("invalid");
  expect((await syncUiAssets(target)).mismatches).toBe(1);
});
