// SPDX-License-Identifier: Apache-2.0
/**
 * Allowlisted crawl. Full captures stay private under `store`; only passages (bounded excerpts
 * with provenance) feed RAG. Fandom is refused; robots.txt is not read; no challenge bypass.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export interface CrawlPassage {
  url: string;
  title: string;
  text: string;
  sha256: string;
  fetchedAt: string;
}

export interface CrawlOptions {
  seeds: readonly string[];
  allowHosts: readonly string[];
  store: string;
  maxPages?: number;
  concurrency?: number;
  /** Defaults to a `Bun.FetchSession` when present, else global fetch. */
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
  now?: () => Date;
}

export interface CrawlResult {
  pages: number;
  skipped: { url: string; reason: string }[];
  passages: string;
}

const FORBIDDEN = /(^|\.)fandom\.com$|(^|\.)wikia\.(com|org)$/i;

export function hostAllowed(url: URL, allow: readonly string[]): boolean {
  if (!/^https?:$/.test(url.protocol) || FORBIDDEN.test(url.hostname)) return false;
  return allow.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
}

async function extract(html: string, base: string) {
  let title = "";
  let text = "";
  const links: string[] = [];
  await new HTMLRewriter()
    .on("title", { text: (c) => void (title += c.text) })
    .on("script,style,noscript,nav,footer", { element: (e) => void e.remove() })
    .on("body", { text: (c) => void (text += c.text) })
    .on("a[href]", {
      element: (e) => {
        try {
          links.push(new URL(e.getAttribute("href")!, base).href.split("#")[0]!);
        } catch {}
      },
    })
    .transform(new Response(html))
    .text();
  return { title: title.trim(), text: text.replace(/\s+/g, " ").trim(), links };
}

function defaultFetcher(): { fetcher: NonNullable<CrawlOptions["fetcher"]>; close(): void } {
  const Session = (Bun as unknown as { FetchSession?: new (o?: object) => any }).FetchSession;
  if (typeof Session !== "function")
    return { fetcher: (url, init) => fetch(url, init), close() {} };
  const session = new Session({ keepAlive: true });
  return { fetcher: (url, init) => session.fetch(url, init), close: () => session.close() };
}

export async function crawl(options: CrawlOptions): Promise<CrawlResult> {
  const owned = options.fetcher ? null : defaultFetcher();
  const fetcher = options.fetcher ?? owned!.fetcher;
  const maxPages = options.maxPages ?? 50;
  const concurrency = Math.max(1, options.concurrency ?? 4);
  const now = options.now ?? (() => new Date());
  const skipped: CrawlResult["skipped"] = [];
  const queue: string[] = [];
  const seen = new Set<string>();
  const passages: CrawlPassage[] = [];
  const enqueue = (raw: string) => {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return void skipped.push({ url: raw, reason: "invalid" });
    }
    url.hash = "";
    if (!hostAllowed(url, options.allowHosts))
      return void skipped.push({ url: raw, reason: "host" });
    if (!seen.has(url.href)) {
      seen.add(url.href);
      queue.push(url.href);
    }
  };

  const visit = async (href: string) => {
    const response = await fetcher(href, { headers: { accept: "text/html" } }).catch(() => null);
    if (!response?.ok || !/html/i.test(response.headers.get("content-type") ?? "html"))
      return void skipped.push({ url: href, reason: `status:${response?.status ?? "error"}` });
    const html = await response.text();
    const page = await extract(html, href);
    const digest = new Bun.CryptoHasher("sha256").update(html).digest("hex");
    await Bun.write(join(options.store, "captures", `${digest}.html`), html);
    passages.push({
      url: href,
      title: page.title,
      text: page.text.slice(0, 4000),
      sha256: digest,
      fetchedAt: now().toISOString(),
    });
    page.links.forEach(enqueue);
  };

  try {
    options.seeds.forEach(enqueue);
    await mkdir(join(options.store, "captures"), { recursive: true });
    while (queue.length > 0 && passages.length < maxPages) {
      const batch = queue.splice(0, Math.min(concurrency, maxPages - passages.length));
      await Promise.all(batch.map(visit));
    }
  } finally {
    owned?.close();
  }
  const file = join(options.store, "passages.jsonl");
  await Bun.write(
    file,
    passages.map((p) => JSON.stringify(p)).join("\n") + (passages.length ? "\n" : ""),
  );
  return { pages: passages.length, skipped, passages: file };
}
