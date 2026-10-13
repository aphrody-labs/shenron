// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mergeEntries, run, type InventoryEntry } from "./inventory-delta";
import { digest } from "./cloudflare-ops";
const old = (sourcePath: string): InventoryEntry => ({
  sourcePath,
  sha256: "a".repeat(64),
  size: 1,
  contentType: "text/javascript",
  cacheControl: "public",
});

test("a recovered public R2 shard has no private filesystem source path", () => {
  const previous: Record<string, InventoryEntry> = JSON.parse(
    JSON.stringify({
      "/_next/static/video.js": old("/active-cdn/_next/static/video.js"),
      "/catalog/assets/index.json": old("/active-cdn/catalog/assets/index.json"),
    }),
    (key, value) => (key === "sourcePath" ? undefined : value),
  );
  const current = {
    "/_next/static/video.js": {
      ...old("/qualified-cdn/_next/static/video.js"),
      sha256: digest("current video chunk"),
    },
  };
  const merged = mergeEntries(previous, current);
  expect(merged["/_next/static/video.js"]).toEqual(current["/_next/static/video.js"]);
  expect(merged["/catalog/assets/index.json"]).toEqual(previous["/catalog/assets/index.json"]);
  expect(Object.keys(merged)).toHaveLength(2);
});

test("delta pins the previous inventory and emits public shards without source paths", async () => {
  const dir = await mkdtemp(join(tmpdir(), "shenron-cdn-delta-"));
  try {
    const site = join(dir, "site");
    const release = join(dir, "release");
    await mkdir(join(site, "public"), { recursive: true });
    await mkdir(join(site, ".next/static"), { recursive: true });
    await mkdir(release);
    await Bun.write(join(site, "public/logo.svg"), "new-logo");
    await Bun.write(join(site, ".next/static/new.js"), "new-chunk");
    const previous = JSON.stringify({ entries: { "/old.svg": old("/old/old.svg") } });
    const file = join(dir, "previous.json");
    await Bun.write(file, previous);
    const args = [
      "--previous",
      file,
      "--previous-sha256",
      digest(previous),
      "--site",
      site,
      "--static",
      join(site, ".next/static"),
      "--release-public",
      release,
      "--out",
      join(dir, "out"),
    ];
    const wrong = [...args];
    wrong[3] = "0".repeat(64);
    await expect(run(wrong)).rejects.toThrow("Previous inventory differs");
    expect(await Bun.file(join(dir, "out/inventory.json")).exists()).toBe(false);
    await run(args);
    const report = await Bun.file(join(dir, "out/inventory.json")).json();
    expect(report.sourcePublicPaths).toBe(3);
    expect(report.sourceAddedObjects).toBe(2);
    expect(report.publicPaths).toBe(3 + report.catalog.artifacts);
    expect(report.addedObjects).toBeGreaterThan(2);
    const indexEntry = report.entries["/catalog/assets/index.json"];
    expect(indexEntry.cacheControl).toBe("no-store");
    const index = await Bun.file(indexEntry.sourcePath).json();
    expect(index.totalFiles).toBe(3);
    expect(index.inventorySha256).toBe(report.sourceInventorySha256);
    expect(indexEntry.sha256).toBe(report.catalog.indexSha256);
    const sourceSnapshot = await Bun.file(join(dir, "out/source-inventory.json")).text();
    expect(digest(sourceSnapshot)).toBe(report.sourceInventorySha256);
    expect(Object.keys(JSON.parse(sourceSnapshot).entries)).toHaveLength(3);
    const shard = digest("/logo.svg").slice(0, 2);
    const rows = await Bun.file(join(dir, "out/shards", shard + ".json")).json();
    expect(rows["/logo.svg"].sha256).toBe(digest("new-logo"));
    expect(Object.hasOwn(rows["/logo.svg"], "sourcePath")).toBe(false);
    const next = [...args];
    const reportBytes = await Bun.file(join(dir, "out/inventory.json")).text();
    next[1] = join(dir, "out/inventory.json");
    next[3] = digest(reportBytes);
    next[next.length - 1] = join(dir, "next-out");
    await run(next);
    const second = await Bun.file(join(dir, "next-out/inventory.json")).json();
    expect(second.sourcePublicPaths).toBe(3);
    expect(second.sourceAddedObjects).toBe(0);
    expect(second.catalog.revision).toBe(report.catalog.revision);
    expect(second.publicPaths).toBe(report.publicPaths);
    expect(second.addedObjects).toBe(1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("a deployment delta retains old chunk URLs and gateway precedence", () => {
  const previous = {
    "/_next/static/old.js": old("/old-payload/old.js"),
    "/_next/static/shared.js": old("/srv/shenron-cdn/_next/static/shared.js"),
    "/logo.svg": old("/old-payload/logo.svg"),
  };
  const current = {
    "/_next/static/new.js": old("/new-payload/new.js"),
    "/_next/static/shared.js": old("/new-payload/shared.js"),
    "/logo.svg": old("/new-payload/logo.svg"),
  };
  const result = mergeEntries(previous, current);
  expect(result["/_next/static/old.js"]).toEqual(previous["/_next/static/old.js"]);
  expect(result["/_next/static/shared.js"]).toEqual(previous["/_next/static/shared.js"]);
  expect(result["/_next/static/new.js"]).toEqual(current["/_next/static/new.js"]);
  expect(result["/logo.svg"]).toEqual(current["/logo.svg"]);
  expect(previous["/logo.svg"].sourcePath).toBe("/old-payload/logo.svg");
});
