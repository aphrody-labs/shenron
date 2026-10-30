#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Publishes the staged Gecko browser build (apps/site/public/wasm/gecko/**, see prepare-gecko-wasm.ts) to the
 * Shenron CDN under /assets/gecko/. The gateway allow-list serves /assets/** and only a fixed set of /wasm/
 * names, so the hashed files live under /assets/. Additive: existing CDN paths are never changed.
 *
 *   bun scripts/ops/publish-gecko-cdn.ts [--dry-run]
 *
 * Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (~/.aphrody/config/cloudflare.env) and ssh access to dbfr.
 */
import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { livePrefix, mintClient, publishItems, type CdnItem } from "./web-engine-cdn";

const root = join(import.meta.dir, "..", "..", "apps", "site", "public", "wasm", "gecko");
const types: Record<string, string> = {
  ".wasm": "application/wasm",
  ".js": "application/javascript",
};

const items: CdnItem[] = [];
for (const name of readdirSync(root)) {
  const type = types[name.slice(name.lastIndexOf("."))];
  if (!type || !/^gecko_web(?:_bg)?\.[a-f0-9]{16}\.(?:wasm|js)$/.test(name)) continue;
  const bytes = new Uint8Array(await Bun.file(join(root, name)).arrayBuffer());
  items.push({
    path: `/assets/gecko/${name}`,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes,
    contentType: type,
  });
}
if (items.length !== 2) throw new Error(`expected the hashed gecko js and wasm in ${root}`);
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
const entriesFile = join(tmpdir(), "cdn-gecko-entries.json");
await Bun.write(entriesFile, JSON.stringify(entries));
const run = async (cmd: string[]) => {
  const p = Bun.spawn(cmd, { stdout: "inherit", stderr: "inherit" });
  if (await p.exited) throw new Error(`${cmd[0]} failed`);
};
await run(["scp", "-q", entriesFile, join(import.meta.dir, "cdn-origin-add.ts"), "dbfr:/tmp/"]);
await run([
  "ssh",
  "dbfr",
  'sudo -n "$(command -v bun || echo $HOME/.bun/bin/bun)" /tmp/cdn-origin-add.ts /tmp/cdn-gecko-entries.json',
]);
