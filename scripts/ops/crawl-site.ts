// SPDX-License-Identifier: Apache-2.0
/**
 * Complete, resumable crawl of the public site through the shared Rust frontier.
 *
 * The frontier lives in var/reports/site-crawl/frontier.sqlite and survives interruptions: each
 * batch drains up to --batch pending requests, so the script can be killed and relaunched.
 * Sitemaps seed the frontier on the first batch only (seeding ~25k URLs takes minutes); admin,
 * API and profile routes are excluded, as in robots.txt. Run it in tmux on long crawls.
 *
 * Usage: bun scripts/ops/crawl-site.ts [--origin URL] [--out DIR] [--batch N] [--max-batches N]
 *        [--concurrency N] [--delay MS] [--max-depth N]
 */
import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const option = (name: string, fallback: string) => {
  const index = Bun.argv.indexOf(name);
  return index < 0 ? fallback : (Bun.argv[index + 1] ?? fallback);
};
const integer = (name: string, fallback: string, min: number, max: number) => {
  const value = Number(option(name, fallback));
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new Error(`${name} must be an integer in ${min}..${max}`);
  return value;
};

const origin = new URL(option("--origin", "https://dragonballfr.com")).origin;
const out = option("--out", "var/reports/site-crawl");
const batch = integer("--batch", "500", 1, 5000);
const maxBatches = integer("--max-batches", "200", 1, 10_000);
const concurrency = integer("--concurrency", "4", 1, 8);
const delay = integer("--delay", "100", 0, 5000);
const maxDepth = integer("--max-depth", "5", 0, 10);
const frontier = join(out, "frontier.sqlite");

export function frontierStats(path: string) {
  const db = new Database(path, { readonly: true });
  try {
    const states = Object.fromEntries(
      (
        db.query("select state, count(*) n from requests group by state").all() as {
          state: string;
          n: number;
        }[]
      ).map((row) => [row.state, row.n]),
    );
    const pages = (db.query("select count(*) n from pages").get() as { n: number }).n;
    return { pending: 0, locked: 0, done: 0, failed: 0, ...states, pages };
  } finally {
    db.close();
  }
}

async function main() {
  await mkdir(out, { recursive: true });
  const host = new URL(origin).hostname;
  const seeded = await Bun.file(frontier).exists();
  const startedAt = new Date().toISOString();
  let stats = seeded ? frontierStats(frontier) : undefined;
  for (let run = 0; run < maxBatches; run++) {
    if (stats && stats.pending + stats.locked === 0) break;
    const args = [
      "web",
      "crawl",
      origin,
      "--sqlite",
      frontier,
      "--allowed-domains",
      host,
      "--exclude-url-regex",
      "/(api|admin|profile)(/|$)",
      "--max-depth",
      String(maxDepth),
      "--max-requests",
      String(batch),
      "--concurrency",
      String(concurrency),
      "--per-host-delay",
      String(delay),
      "--max-retries",
      "3",
      "--obey-robots",
      "--json",
    ];
    if (!seeded && run === 0) args.push("--sitemaps", "--max-sitemaps", "25");
    const child = Bun.spawn(["aphrody", ...args], { stdout: "pipe", stderr: "inherit" });
    const report = await new Response(child.stdout).text();
    const code = await child.exited;
    if (code !== 0)
      throw new Error(`aphrody web crawl exited with ${code}: ${report.slice(0, 400)}`);
    stats = frontierStats(frontier);
    console.log(JSON.stringify({ batch: run + 1, ...stats }));
  }
  const final = frontierStats(frontier);
  const summary = {
    origin,
    startedAt,
    finishedAt: new Date().toISOString(),
    complete: final.pending + final.locked === 0,
    ...final,
  };
  await Bun.write(join(out, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
  if (!summary.complete) process.exitCode = 2;
}

if (import.meta.main) await main();
