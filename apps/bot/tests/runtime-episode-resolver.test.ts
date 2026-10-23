import "./setup";
import { beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  describeSpawnError,
  episodeResolver,
  EPISODE_RESOLVER_SCRIPT,
  locateEpisodeResolver,
  resetEpisodeResolver,
} from "../src/lib/episode-resolver";

beforeEach(() => resetEpisodeResolver());

function checkout(withScript: boolean) {
  const dir = mkdtempSync(join(tmpdir(), "shenron-bxc-"));
  if (withScript) {
    mkdirSync(join(dir, "scripts"), { recursive: true });
    writeFileSync(join(dir, EPISODE_RESOLVER_SCRIPT), "// stub\n");
  }
  return dir;
}

describe("on-the-fly episode resolver", () => {
  test("a checkout with the script is usable", () => {
    const dir = checkout(true);
    const found = locateEpisodeResolver({ env: { BXC_DIR: dir } });
    expect(found).toEqual({ resolver: { dir, script: EPISODE_RESOLVER_SCRIPT } });
  });

  test("the container case: BXC_DIR points at nothing", () => {
    const found = locateEpisodeResolver({ env: { BXC_DIR: join(tmpdir(), "no-such-bxc") } });
    expect(found).toMatchObject({ missing: "BXC_DIR directory absent" });
  });

  test("a directory without the script is reported as such", () => {
    const found = locateEpisodeResolver({ env: { BXC_DIR: checkout(false) } });
    expect(found).toMatchObject({ missing: `${EPISODE_RESOLVER_SCRIPT} absent` });
  });

  test("defaults to ~/bxc", () => {
    const home = mkdtempSync(join(tmpdir(), "shenron-home-"));
    expect(locateEpisodeResolver({ env: {}, home })).toMatchObject({
      dir: join(home, "bxc"),
      missing: "BXC_DIR directory absent",
    });
  });

  test("disabling is decided and logged once, then silent", () => {
    const lines: string[] = [];
    const locator = { env: { BXC_DIR: join(tmpdir(), "no-such-bxc") } };
    expect(episodeResolver(locator, (line) => lines.push(line))).toBeNull();
    expect(episodeResolver(locator, (line) => lines.push(line))).toBeNull();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("disabled");
    expect(lines[0]).toContain("BXC_DIR directory absent");
  });

  test("a usable checkout is returned without any log", () => {
    const dir = checkout(true);
    const lines: string[] = [];
    expect(episodeResolver({ env: { BXC_DIR: dir } }, (line) => lines.push(line))).toEqual({
      dir,
      script: EPISODE_RESOLVER_SCRIPT,
    });
    expect(lines).toHaveLength(0);
  });

  test("spawn errors are described on one bounded line", () => {
    expect(describeSpawnError(new Error("ENOENT: posix_spawn '/home/x/bxc'"))).toBe(
      "Error: ENOENT: posix_spawn '/home/x/bxc'",
    );
    expect(describeSpawnError(new Error("x".repeat(1000))).length).toBe(240);
    expect(describeSpawnError("plain")).toBe("plain");
  });
});
