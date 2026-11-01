#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Adds entries to the inventory served by shenron-cdn-origin and restarts it. Run as root on dbfr:
 *
 *   sudo bun cdn-origin-add.ts <entries.json> [--config /etc/aphrody/cloudflare/origin-cdn.json]
 *
 * entries.json is {"/path": {sha256,size,contentType,cacheControl}}. Existing paths are never changed. The new
 * inventory is written next to the old one (0600), the config is updated atomically with a backup, the service is
 * restarted and checked through its attestation endpoint; any failure restores the previous config and restarts.
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, renameSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";

const sha = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const [entriesPath, ...rest] = process.argv.slice(2);
if (!entriesPath) throw new Error("usage: cdn-origin-add.ts <entries.json> [--config path]");
const defaultConfigPath = existsSync("/srv/shenron/config/cloudflare/origin-cdn.json")
  ? "/srv/shenron/config/cloudflare/origin-cdn.json"
  : "/etc/aphrody/cloudflare/origin-cdn.json";
const configPath =
  rest.includes("--config") && rest[rest.indexOf("--config") + 1]
    ? rest[rest.indexOf("--config") + 1]!
    : defaultConfigPath;
const service = "shenron-cdn-origin.service";

const config = await Bun.file(configPath).json();
const entries = (await Bun.file(entriesPath).json()) as Record<string, Record<string, unknown>>;
for (const [path, entry] of Object.entries(entries)) {
  if (
    !/^\/(assets|wasm|media)\//.test(path) ||
    !/^[a-f0-9]{64}$/.test(String(entry.sha256)) ||
    !Number.isSafeInteger(entry.size)
  )
    throw new Error(`invalid entry ${path}`);
}
const inventory = JSON.parse(await Bun.file(config.inventoryPath).text());
let added = 0;
for (const [path, entry] of Object.entries(entries)) {
  if (Object.hasOwn(inventory.entries, path)) continue;
  inventory.entries[path] = entry;
  added++;
}
if (!added) {
  console.log(JSON.stringify({ added: 0 }));
  process.exit(0);
}
const text = JSON.stringify(inventory);
const inventorySha = sha(text);
const next = join(dirname(config.inventoryPath), `inventory-${inventorySha.slice(0, 12)}.json`);
writeFileSync(next, text, { mode: 0o600 });
chmodSync(next, 0o600);

const backup = `${configPath}.${Date.now()}.bak`;
copyFileSync(configPath, backup);
const write = (value: object) => {
  writeFileSync(configPath + ".tmp", JSON.stringify(value), { mode: 0o400 });
  renameSync(configPath + ".tmp", configPath);
};
const restart = async () => {
  const p = Bun.spawn(["systemctl", "restart", service]);
  await p.exited;
};
write({ ...config, inventoryPath: next, inventorySha256: inventorySha });
await restart();
const probe = async (path?: string) =>
  (
    await fetch(
      `http://127.0.0.1:${config.port}${path ?? "/.well-known/shenron-cdn-origin.json"}`,
      { method: "HEAD" },
    ).catch(() => null)
  )?.status;
const sample = Object.keys(entries).find((p) => Object.hasOwn(inventory.entries, p));
// The origin parses the whole inventory at start, so poll for readiness instead of sleeping.
const ready = async (path?: string) => {
  for (let i = 0; i < 40; i++) {
    if ((await probe(path)) === 200) return true;
    await Bun.sleep(3000);
  }
  return false;
};
const statuses: Record<string, number | undefined> = {};
const ok = (await ready()) && ((statuses.attest = 200), !sample || (await ready(sample)));
statuses.sample = sample ? await probe(sample) : undefined;
if (!ok) {
  copyFileSync(backup, configPath);
  await restart();
  console.error(
    JSON.stringify({
      added,
      restored: true,
      sample,
      attest: statuses.attest,
      sampleStatus: statuses.sample,
    }),
  );
  process.exit(1);
}
// Keep the active inventory and the previous one; drop older generated copies.
const { readdirSync, statSync, unlinkSync } = await import("node:fs");
const dir = dirname(next);
const old = readdirSync(dir)
  .filter(
    (n) =>
      /^inventory-[a-f0-9]{12}\.json$/.test(n) &&
      join(dir, n) !== next &&
      join(dir, n) !== config.inventoryPath,
  )
  .toSorted((a, b) => statSync(join(dir, b)).mtimeMs - statSync(join(dir, a)).mtimeMs)
  .slice(1);
for (const n of old) unlinkSync(join(dir, n));
console.log(JSON.stringify({ added, inventory: next, sha256: inventorySha, backup }));
