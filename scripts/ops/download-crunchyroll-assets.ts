// SPDX-License-Identifier: Apache-2.0
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const summary = await Bun.file("var/reports/crunchyroll-recon-875/summary.json").json();
const outDir = join(process.cwd(), "var", "reports", "crunchyroll-recon-875", "assets");
mkdirSync(outDir, { recursive: true });

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

console.log(`[Asset-Downloader] Starting download of CSS, JS and Fonts...`);

const manifest: Array<{
  url: string;
  localPath: string;
  size: number;
  status: number;
  contentType: string;
}> = [];

// 1. CSS
for (const cssPath of summary.stylesheets) {
  const url = `https://www.crunchyroll.com${cssPath}`;
  const filename = cssPath.split("/").pop()!;
  console.log(`[Asset-Downloader] Downloading CSS: ${filename}...`);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok) {
      const buffer = await res.arrayBuffer();
      const localPath = join(outDir, filename);
      writeFileSync(localPath, Buffer.from(buffer));
      manifest.push({
        url,
        localPath,
        size: buffer.byteLength,
        status: res.status,
        contentType: res.headers.get("content-type") || "text/css",
      });
    }
  } catch (e: any) {
    console.error(`Failed ${url}:`, e.message);
  }
}

// 2. Preloads (Fonts & Scripts)
for (const item of summary.preloads) {
  const url = item.href.startsWith("http") ? item.href : `https://www.crunchyroll.com${item.href}`;
  const filename = item.href.split("/").pop()!.split("?")[0];
  console.log(`[Asset-Downloader] Downloading Preload (${item.as}): ${filename}...`);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok) {
      const buffer = await res.arrayBuffer();
      const localPath = join(outDir, filename);
      writeFileSync(localPath, Buffer.from(buffer));
      manifest.push({
        url,
        localPath,
        size: buffer.byteLength,
        status: res.status,
        contentType: res.headers.get("content-type") || "application/octet-stream",
      });
    }
  } catch (e: any) {
    console.error(`Failed ${url}:`, e.message);
  }
}

// 3. Key Layout & Page JS Chunks
const keyChunks = [
  "webpack-a7afa86db70787cc.js",
  "main-app-f7395f44f3a8e745.js",
  "app/layout-f4abbe64e8810fc5.js",
  "app/%5Blocale%5D/layout-687a87cf967079a9.js",
  "app/%5Blocale%5D/%5B%5B...pathname%5D%5D/loading-b418f7c2afb6c349.js",
];

for (const chunk of keyChunks) {
  const url = `https://www.crunchyroll.com/build/_next/static/chunks/${chunk}`;
  const filename = chunk.split("/").pop()!;
  console.log(`[Asset-Downloader] Downloading Key JS Chunk: ${filename}...`);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok) {
      const buffer = await res.arrayBuffer();
      const localPath = join(outDir, filename);
      writeFileSync(localPath, Buffer.from(buffer));
      manifest.push({
        url,
        localPath,
        size: buffer.byteLength,
        status: res.status,
        contentType: res.headers.get("content-type") || "application/javascript",
      });
    }
  } catch (e: any) {
    console.error(`Failed ${url}:`, e.message);
  }
}

writeFileSync(
  join(process.cwd(), "var", "reports", "crunchyroll-recon-875", "manifest.json"),
  JSON.stringify(manifest, null, 2),
  "utf8",
);
console.log(`[Asset-Downloader] All key assets saved to disk! Total assets: ${manifest.length}`);
