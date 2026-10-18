#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Publishes apps/site/public/wasm/** to the Shenron CDN under /wasm/ (the site loads them from
 * ${NEXT_PUBLIC_CDN_URL}/wasm/... in production), then hands the entries to the origin on dbfr.
 *
 *   bun scripts/ops/publish-wasm-cdn.ts [--dry-run]
 *
 * Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (~/.aphrody/config/cloudflare.env) and ssh access to dbfr.
 * Additive: existing CDN paths are never changed.
 */
import { createHash } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { livePrefix, mintClient, publishItems, type CdnItem } from "./web-engine-cdn";

const root = join(import.meta.dir, "..", "..", "apps", "site", "public", "wasm");
const types: Record<string, string> = {
  ".wasm": "application/wasm",
  ".js": "application/javascript",
  ".json": "application/json",
};

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

const items: CdnItem[] = [];
for (const path of files(root)) {
  const type = types[path.slice(path.lastIndexOf("."))];
  if (!type) continue;
  const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
  items.push({
    path: `/wasm/${relative(root, path).replaceAll("\\", "/")}`,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes,
    contentType: type,
  });
}
console.log(items.map((i) => `${i.path} ${i.bytes.length}`).join("\n"));
if (process.argv.includes("--dry-run")) process.exit(0);

const s3 = await mintClient();
const result = await publishItems(s3, items, await livePrefix(), (message) => console.log(message));
console.log(JSON.stringify({ live: result.live.length, failed: result.failed }));
if (result.failed.length) process.exit(1);

const entries = Object.fromEntries(
  items.map((i) => [
    i.path,
    {
      sha256: i.sha256,
      size: i.bytes.length,
      contentType: i.contentType,
      cacheControl: "public, max-age=31536000, immutable",
    },
  ]),
);
const entriesFile = "/tmp/cdn-wasm-entries.json";
await Bun.write(entriesFile, JSON.stringify(entries));
const run = async (cmd: string[]) => {
  const p = Bun.spawn(cmd, { stdout: "inherit", stderr: "inherit" });
  if (await p.exited) throw new Error(`${cmd[0]} failed`);
};
await run(["scp", "-q", entriesFile, join(import.meta.dir, "cdn-origin-add.ts"), "dbfr:/tmp/"]);
await run([
  "ssh",
  "dbfr",
  'sudo -n "$(command -v bun || echo $HOME/.bun/bin/bun)" /tmp/cdn-origin-add.ts /tmp/cdn-wasm-entries.json',
]);
