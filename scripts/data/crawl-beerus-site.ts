// SPDX-License-Identifier: Apache-2.0
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const seeds = [
  "https://dragonball-super.com/en/",
  "https://www.db-z.com/dragon-ball-super-beerus-ou-et-comment-regarder-la-serie-en-france/",
];
const hash = (value: string | Uint8Array) =>
  new Bun.CryptoHasher("sha256").update(value).digest("hex");
export function isPlaybackMedia(url: string): boolean {
  return /\.(?:mp4|webm|mp3|m4a|m3u8|mpd|ts|m4s|aac|key)(?:[?#]|$)/i.test(url);
}
export function approvedUrl(raw: string, base: string, page: boolean): string | undefined {
  try {
    const url = new URL(raw, base);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return;
    url.hash = "";
    if (url.hostname === "dragonball-super.com") {
      if (page && !url.pathname.startsWith("/en/")) return;
    } else if (url.hostname === "www.db-z.com") {
      if (page && url.pathname !== new URL(seeds[1]!).pathname) return;
      if (!page && !url.pathname.startsWith("/wp-content/")) return;
    } else return;
    if (page) {
      const id = url.searchParams.get("id");
      url.search = "";
      if (
        url.hostname === "dragonball-super.com" &&
        url.pathname === "/en/updates/detail.html" &&
        id &&
        /^[0-9]{8}(?:-[0-9]+)?$/.test(id)
      )
        url.searchParams.set("id", id);
    }
    return url.href;
  } catch {
    return;
  }
}
async function read(url: string): Promise<{ status: number; type: string; bytes: Uint8Array }> {
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
    headers: { "User-Agent": "Shenron-source-crawl/1.4.4 (+https://dragonballfr.com)" },
  });
  const type = response.headers.get("content-type") ?? "";
  if (/^(?:audio|video)\//i.test(type) || /(?:mpegurl|dash\+xml)/i.test(type)) {
    await response.body?.cancel();
    throw new Error("Playback media is excluded from private site capture");
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (response.body) {
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > 16 * 1024 * 1024) throw new Error("Source exceeds the bounded capture size");
      chunks.push(chunk);
    }
  }
  const bytes = new Uint8Array(size);
  let cursor = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  return { status: response.status, type, bytes };
}
export async function crawl(output: string): Promise<void> {
  const directory = resolve(output);
  await mkdir(join(directory, "bodies"), { recursive: true, mode: 0o700 });
  const frontier = [...seeds];
  const seen = new Set<string>();
  const assets = new Set<string>();
  const pages: Record<string, unknown>[] = [];
  const media: Record<string, unknown>[] = [];
  const corpus: Record<string, unknown>[] = [];
  const robots: Record<string, unknown>[] = [];
  const forbidden = new Map<string, string[]>();
  const robotsUnavailable = new Set<string>();
  for (const origin of ["https://dragonball-super.com", "https://www.db-z.com"]) {
    const r = await read(origin + "/robots.txt");
    const text = new TextDecoder().decode(r.bytes);
    if (r.status !== 200 && r.status !== 404) robotsUnavailable.add(origin);
    const blocks = text.split(/\r?\n\s*\r?\n/);
    const rules = blocks
      .filter((block) => /User-agent:\s*\*/i.test(block))
      .flatMap((block) => Array.from(block.matchAll(/^Disallow:\s*(\S+)/gim), (m) => m[1]!));
    forbidden.set(origin, rules);
    robots.push({ url: origin + "/robots.txt", status: r.status, rules, sha256: hash(r.bytes) });
  }
  const permitted = (url: string) => {
    const parsed = new URL(url);
    if (robotsUnavailable.has(parsed.origin)) return false;
    return !(forbidden.get(parsed.origin) ?? []).some((rule) =>
      parsed.pathname.startsWith(rule.replace(/\*.*$/, "")),
    );
  };
  while (frontier.length && seen.size < 128) {
    const url = frontier.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    if (!permitted(url)) {
      pages.push({
        url,
        state: robotsUnavailable.has(new URL(url).origin)
          ? "robots_unavailable"
          : "robots_excluded",
      });
      continue;
    }
    try {
      const r = await read(url);
      const digest = hash(r.bytes);
      await writeFile(join(directory, "bodies", digest), r.bytes, { mode: 0o600 });
      const row: Record<string, unknown> = {
        url,
        status: r.status,
        contentType: r.type,
        bytes: r.bytes.byteLength,
        sha256: digest,
        fetchedAt: new Date().toISOString(),
      };
      pages.push(row);
      if (r.status !== 200 || !r.type.includes("text/html")) continue;
      const text: string[] = [];
      const titles: string[] = [];
      const links = new Set<string>();
      const rewriter = new HTMLRewriter()
        .on("title", {
          text(chunk) {
            titles.push(chunk.text);
          },
        })
        .on("h1,h2,h3,p,li", {
          text(chunk) {
            text.push(chunk.text);
          },
        })
        .on("a[href]", {
          element(element) {
            const raw = element.getAttribute("href");
            if (!raw) return;
            try {
              links.add(new URL(raw, url).href);
            } catch {
              return;
            }
            const next = approvedUrl(raw, url, true);
            if (next && !seen.has(next) && !frontier.includes(next)) frontier.push(next);
          },
        })
        .on("img,link,script,source,video", {
          element(element) {
            const candidates = [
              element.getAttribute("src"),
              element.getAttribute("data-src"),
              element.getAttribute("poster"),
            ];
            if (element.tagName === "link") candidates.push(element.getAttribute("href"));
            const srcset = element.getAttribute("srcset") ?? element.getAttribute("data-srcset");
            if (srcset)
              candidates.push(...srcset.split(",").map((entry) => entry.trim().split(/\s+/)[0]!));
            for (const raw of candidates) {
              if (!raw) continue;
              const next = approvedUrl(raw, url, false);
              if (next && !isPlaybackMedia(next)) assets.add(next);
            }
          },
        });
      await rewriter
        .transform(
          new Response(new TextDecoder().decode(r.bytes), {
            headers: { "Content-Type": "text/html" },
          }),
        )
        .text();
      row.title = titles.join("").trim();
      row.links = [...links];
      corpus.push({
        url,
        title: row.title,
        text: text.join(" ").replace(/\s+/g, " ").trim(),
        fetchedAt: row.fetchedAt,
        sourceSha256: digest,
      });
    } catch {
      pages.push({ url, state: "unavailable", fetchedAt: new Date().toISOString() });
    }
  }
  let totalBytes = 0;
  const queue = [...assets];
  const assetsSeen = new Set<string>();
  while (queue.length && assetsSeen.size < 256 && totalBytes < 128 * 1024 * 1024) {
    const url = queue.shift()!;
    if (assetsSeen.has(url) || isPlaybackMedia(url)) continue;
    assetsSeen.add(url);
    if (!permitted(url)) {
      media.push({
        url,
        state: robotsUnavailable.has(new URL(url).origin)
          ? "robots_unavailable"
          : "robots_excluded",
      });
      continue;
    }
    try {
      const r = await read(url);
      const digest = hash(r.bytes);
      await writeFile(join(directory, "bodies", digest), r.bytes, { mode: 0o600 });
      totalBytes += r.bytes.byteLength;
      media.push({
        url,
        status: r.status,
        contentType: r.type,
        bytes: r.bytes.byteLength,
        sha256: digest,
        fetchedAt: new Date().toISOString(),
        publicCandidate:
          url.startsWith("https://dragonball-super.com/") &&
          r.status === 200 &&
          r.type.startsWith("image/"),
      });
      if (r.status === 200 && r.type.includes("text/css")) {
        for (const match of new TextDecoder()
          .decode(r.bytes)
          .matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)) {
          const next = approvedUrl(match[1]!, url, false);
          if (next && !isPlaybackMedia(next) && !assetsSeen.has(next)) queue.push(next);
        }
        for (const match of new TextDecoder()
          .decode(r.bytes)
          .matchAll(/@import\s+["']([^"']+)["']/gi)) {
          const next = approvedUrl(match[1]!, url, false);
          if (next && !isPlaybackMedia(next) && !assetsSeen.has(next)) queue.push(next);
        }
      }
    } catch {
      media.push({ url, state: "unavailable" });
    }
  }
  const report = {
    schema: "shenron-source-crawl/v1",
    verifiedAt: new Date().toISOString(),
    seeds,
    robots,
    pages,
    media,
    privateArchive: true,
    remainingPages: frontier,
    remainingAssets: queue,
    bytes: totalBytes,
  };
  await writeFile(join(directory, "manifest.json"), JSON.stringify(report, null, 2), {
    mode: 0o600,
  });
  await writeFile(
    join(directory, "corpus.jsonl"),
    corpus.map((row) => JSON.stringify(row)).join("\n") + "\n",
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      pages: pages.length,
      assets: media.length,
      bytes: totalBytes,
      remainingPages: frontier.length,
      remainingAssets: queue.length,
    }),
  );
}
if (import.meta.main) {
  const index = Bun.argv.indexOf("--out");
  await crawl(
    index >= 0
      ? Bun.argv[index + 1]!
      : resolve(import.meta.dir, "../../var/reports/beerus-site-crawl"),
  );
}
