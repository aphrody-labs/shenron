#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Shenron Crawl executed via Obscura using:
 * - Mounted Network Disk B:\ (Opera User Data)
 * - SSH Dynamic SOCKS5 Proxy through DBFR (127.0.0.1:1080 -> 51.255.162.6)
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PROXY_URL = "socks5://127.0.0.1:1080";
const STORAGE_DIR = "B:\\";
const OUTPUT_DIR = join(import.meta.dir, "../../var/reports/shenron-opera-crawl");

const TARGET_ROUTES = [
  "https://dragonballfr.com",
  "https://dragonballfr.com/news",
  "https://dragonballfr.com/wiki/canon",
  "https://dragonballfr.com/wiki/characters",
  "https://dragonballfr.com/wiki/databooks",
  "https://dragonballfr.com/wiki/manga",
  "https://dragonballfr.com/wiki/episodes",
  "https://dragonballfr.com/rankings",
  "https://dragonballfr.com/catalog",
];

interface CrawlPageResult {
  url: string;
  markdownPath: string;
  linksCount: number;
  extractedAt: string;
  status: "success" | "error";
  error?: string;
}

async function main() {
  console.log(`[Crawl] Initializing Shenron Crawl with Opera User Data`);
  console.log(`[Crawl] Proxy: ${PROXY_URL}`);
  console.log(`[Crawl] Storage: ${STORAGE_DIR}`);
  console.log(`[Crawl] Output: ${OUTPUT_DIR}`);

  await mkdir(OUTPUT_DIR, { recursive: true });
  await mkdir(join(OUTPUT_DIR, "pages"), { recursive: true });

  // 1. Verify Proxy egress IP
  console.log(`[Crawl] Verifying Proxy IP via Obscura...`);
  const ipProc = Bun.spawnSync([
    "obscura",
    "fetch",
    "https://api.ipify.org",
    "--proxy",
    PROXY_URL,
    "--dump",
    "original",
  ]);
  const egressIp = ipProc.stdout.toString().trim();
  console.log(`[Crawl] Egress IP: ${egressIp}`);

  const results: CrawlPageResult[] = [];

  for (const url of TARGET_ROUTES) {
    const slug = new URL(url).pathname.replaceAll("/", "_") || "_root";
    const outMarkdown = join(OUTPUT_DIR, "pages", `${slug}.md`);
    const outLinks = join(OUTPUT_DIR, "pages", `${slug}.links.txt`);

    console.log(`[Crawl] Fetching ${url} ...`);
    try {
      // Fetch Markdown
      const mdProc = Bun.spawnSync([
        "obscura",
        "fetch",
        url,
        "--proxy",
        PROXY_URL,
        "--storage-dir",
        STORAGE_DIR,
        "--stealth",
        "--dump",
        "markdown",
        "--wait",
        "2",
        "--timeout",
        "25",
      ]);

      if (mdProc.exitCode !== 0) {
        throw new Error(mdProc.stderr.toString().trim() || `Exit code ${mdProc.exitCode}`);
      }

      await writeFile(outMarkdown, mdProc.stdout);

      // Fetch Links
      const linksProc = Bun.spawnSync([
        "obscura",
        "fetch",
        url,
        "--proxy",
        PROXY_URL,
        "--storage-dir",
        STORAGE_DIR,
        "--stealth",
        "--dump",
        "links",
        "--timeout",
        "15",
      ]);

      const links = linksProc.stdout
        .toString()
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

      await writeFile(outLinks, links.join("\n"));

      results.push({
        url,
        markdownPath: outMarkdown,
        linksCount: links.length,
        extractedAt: new Date().toISOString(),
        status: "success",
      });
      console.log(`[Crawl] OK: ${url} (${links.length} links discovered)`);
    } catch (err: any) {
      console.error(`[Crawl] FAIL: ${url}:`, err.message);
      results.push({
        url,
        markdownPath: outMarkdown,
        linksCount: 0,
        extractedAt: new Date().toISOString(),
        status: "error",
        error: err.message,
      });
    }
  }

  const manifest = {
    schema: "shenron-opera-crawl/v1",
    timestamp: new Date().toISOString(),
    proxy: PROXY_URL,
    egressIp,
    storageDir: STORAGE_DIR,
    targetCount: TARGET_ROUTES.length,
    successCount: results.filter((r) => r.status === "success").length,
    results,
  };

  await writeFile(join(OUTPUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));

  console.log(`\n[Crawl] Complete! Manifest saved to ${join(OUTPUT_DIR, "manifest.json")}`);
  console.log(
    `[Crawl] Summary: ${manifest.successCount}/${manifest.targetCount} routes successfully crawled.`,
  );
}

await main();
