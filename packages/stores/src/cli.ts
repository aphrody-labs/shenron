// SPDX-License-Identifier: Apache-2.0
/**
 * Store sync for the Dragon Ball ecosystem.
 *
 *   bun packages/stores/src/cli.ts [--stores steam,appstore] [--regions us,jp] [--terms "dragon ball"] [--apply]
 *
 * Without --apply it prints the listings as JSON and writes nothing. With --apply it upserts them
 * into bot.db_game_store_listings on the host named by SHENRON_SSH_HOST (default `prd`), under the
 * deploy lock. Set SHENRON_STORE_PROXY to read another storefront region through an exit you operate.
 */
import { parseArgs } from "node:util";
import { upsertSql } from "./sql";
import { CONNECTORS, DEFAULT_REGIONS, DEFAULT_TERMS, collectListings } from "./sync";
import { STORE_IDS, type StoreId } from "./types";

const { values } = parseArgs({
  options: { stores: { type: "string" }, regions: { type: "string" }, terms: { type: "string" }, apply: { type: "boolean", default: false } },
});

const list = (value: string | undefined, fallback: readonly string[]) => (value ? value.split(",").map((item) => item.trim()).filter(Boolean) : [...fallback]);
const stores = list(values.stores, STORE_IDS) as StoreId[];
for (const store of stores) if (!(store in CONNECTORS)) throw new Error(`unknown store: ${store}`);

const failures: string[] = [];
const listings = await collectListings({
  stores,
  regions: list(values.regions, DEFAULT_REGIONS),
  terms: list(values.terms, DEFAULT_TERMS),
  onError: (store, region, error) => failures.push(`${store}/${region}: ${error instanceof Error ? error.message : String(error)}`),
});

if (!values.apply) {
  console.log(JSON.stringify({ count: listings.length, failures, listings }, null, 2));
} else {
  const host = process.env.SHENRON_SSH_HOST ?? "prd";
  const command = "flock -w 120 /run/lock/shenron-deploy.lock sudo -n docker exec -i shenron-postgres psql -U postgres -d shenron_site -v ON_ERROR_STOP=1 -At";
  const child = Bun.spawn(["ssh", host, command], { stdin: new Blob([upsertSql(listings)]), stdout: "pipe", stderr: "inherit" });
  const output = await new Response(child.stdout).text();
  if ((await child.exited) !== 0) throw new Error("database write failed");
  console.log(JSON.stringify({ applied: listings.length, failures, result: output.trim().split("\n").slice(-2) }));
}
if (failures.length) process.exitCode = 2;
