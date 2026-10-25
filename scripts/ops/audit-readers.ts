// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { Database } from "bun:sqlite";
import { readerAssetUrl } from "../../apps/site/src/lib/reader-assets";

type Item = Record<string, unknown>;
type Failure = { url: string; kind: string; status?: number; detail?: string };
const option = (name: string, fallback: string) => {
  const index = Bun.argv.indexOf(name);
  return index < 0 ? fallback : (Bun.argv[index + 1] ?? fallback);
};

export async function auditReaders() {
  const origin = new URL(option("--origin", "https://dragonballfr.com")).origin;
  const output = option("--out", "var/reports/readers");
  const concurrency = Number(option("--concurrency", "3"));
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new Error("--concurrency must be in 1..8");
  }
  await mkdir(output, { recursive: true });
  const pages = new Set<string>();
  const assets = new Set<string>();
  const embeds = new Set<string>();
  const chapters = new Set<number>();
  const failures: Failure[] = [];
  const counts = {
    volumes: 0,
    chapters: 0,
    databooks: 0,
    episodes: 0,
    movies: 0,
    checkedPages: 0,
    checkedAssets: 0,
    checkedEmbeds: 0,
  };
  const startedAt = new Date().toISOString();
  const report = () => ({
    origin,
    startedAt,
    updatedAt: new Date().toISOString(),
    counts,
    discovered: { pages: pages.size, assets: assets.size, embeds: embeds.size },
    failures,
    rendered: false,
  });
  const checkpoint = () =>
    Bun.write(join(output, "report.partial.json"), JSON.stringify(report(), null, 2));
  async function pool<T>(items: T[], run: (item: T) => Promise<void>) {
    let index = 0;
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (index < items.length) await run(items[index++]!);
      }),
    );
  }
  const url = (path: string) => new URL(path, origin).href;
  function media(value: unknown) {
    if (typeof value !== "string" || !value.trim()) return;
    assets.add(url(readerAssetUrl(value)));
  }
  function addPlayers(value: unknown) {
    if (!Array.isArray(value)) return;
    for (const player of value as Item[]) {
      if (typeof player.embedUrl === "string" && URL.canParse(player.embedUrl))
        embeds.add(player.embedUrl);
      else failures.push({ url: origin, kind: "malformed-player" });
    }
  }
  async function json(path: string): Promise<Item> {
    const target = url(path);
    const response = await request(target);
    if (!response.ok) throw new Error(`Catalog request failed: ${response.status} ${target}`);
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error(`Invalid catalog: ${target}`);
    return body as Item;
  }
  async function request(target: string, method = "GET"): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await fetch(target, {
          method,
          signal: AbortSignal.timeout(30000),
          redirect: "follow",
        });
        if (attempt >= 3 || ![429, 502, 503, 504].includes(response.status)) return response;
        await response.body?.cancel();
      } catch (error) {
        if (attempt >= 3) throw error;
      }
      await Bun.sleep(1000 * 2 ** attempt);
    }
  }
  const catalogue = await json("/api/manga");
  const volumes = catalogue.catalog as Item[];
  if (!Array.isArray(volumes)) throw new Error("Missing manga catalogue");
  counts.volumes = volumes.length;
  await pool(volumes, async (volume) => {
    const path = `/wiki/manga/volume/${volume.id}`;
    pages.add(url(path));
    try {
      const detail = await json(`/api/manga/volume/${volume.id}`);
      for (const chapter of (detail.chapters as Item[] | undefined) ?? []) {
        if (typeof chapter.id === "number") chapters.add(chapter.id);
      }
    } catch (error) {
      failures.push({ url: url(path), kind: "volume-api", detail: String(error) });
    }
  });
  counts.chapters = chapters.size;
  await checkpoint();
  await pool([...chapters], async (id) => {
    const path = `/wiki/manga/${id}`;
    pages.add(url(path));
    try {
      const chapter = await json(`/api/manga/chapter/${id}`);
      for (const page of (chapter.pageList as Item[] | undefined) ?? []) media(page.image);
    } catch (error) {
      failures.push({ url: url(path), kind: "chapter-api", detail: String(error) });
    }
  });
  for (let offset = 0, total = Infinity; offset < total;) {
    const books = await json(`/api/databooks?limit=100&offset=${offset}`);
    const items = books.items as Item[];
    total = Number(books.total);
    if (!Array.isArray(items) || !Number.isSafeInteger(total))
      throw new Error("Invalid databook pagination");
    if (items.length === 0 && offset < total) throw new Error("Incomplete databook catalogue");
    for (const book of items) {
      pages.add(url(`/wiki/databooks/${book.id}`));
      for (const page of (book.pages as Item[] | undefined) ?? []) media(page.image);
      counts.databooks++;
    }
    offset += items.length;
    await checkpoint();
  }
  for (let offset = 0, total = Infinity; offset < total;) {
    const list = await json(`/api/episodes?limit=100&offset=${offset}`);
    const items = list.episodes as Item[];
    total = Number(list.total);
    if (!Array.isArray(items) || !Number.isSafeInteger(total))
      throw new Error("Invalid episode pagination");
    if (items.length === 0 && offset < total) throw new Error("Incomplete episode catalogue");
    for (const episode of items) {
      pages.add(url(String(episode.url)));
      addPlayers(episode.players);
      counts.episodes++;
    }
    offset += items.length;
  }
  const movies = (await json("/api/movies")).movies as Item[];
  if (!Array.isArray(movies)) throw new Error("Missing movie catalogue");
  for (const movie of movies) {
    pages.add(url(String(movie.url)));
    addPlayers(movie.players);
    counts.movies++;
  }
  const frontier = option("--frontier", "");
  if (frontier) {
    const db = new Database(frontier, { readonly: true });
    try {
      for (const row of db.query<{ url: string }, []>("SELECT url FROM requests").all())
        pages.add(row.url);
      for (const row of db
        .query<{ url: string; last_error: string }, []>(
          "SELECT url,last_error FROM requests WHERE state='failed'",
        )
        .all())
        failures.push({ url: row.url, kind: "crawl", detail: row.last_error });
    } finally {
      db.close();
    }
  }
  console.log(JSON.stringify({ stage: "catalogues", ...report() }));
  await checkpoint();
  async function check(target: string, kind: "page" | "asset" | "embed") {
    try {
      const response = await request(target, kind === "asset" ? "HEAD" : "GET");
      const type = response.headers.get("content-type") ?? "";
      if (!response.ok || (kind === "asset" && !type.startsWith("image/")))
        failures.push({ url: target, kind, status: response.status, detail: type });
      if (kind === "page" && !type.includes("text/html"))
        failures.push({
          url: target,
          kind: "page-content-type",
          status: response.status,
          detail: type,
        });
      await response.body?.cancel();
    } catch (error) {
      failures.push({ url: target, kind, detail: String(error) });
    }
    if (kind === "page") counts.checkedPages++;
    else if (kind === "asset") counts.checkedAssets++;
    else counts.checkedEmbeds++;
    if ((counts.checkedPages + counts.checkedAssets + counts.checkedEmbeds) % 100 === 0) {
      await checkpoint();
      console.log(JSON.stringify({ stage: kind, counts, failures: failures.length }));
    }
  }
  await pool([...pages], (target) => check(target, "page"));
  await pool([...assets], (target) => check(target, "asset"));
  if (Bun.argv.includes("--embeds")) await pool([...embeds], (target) => check(target, "embed"));
  await Bun.write(
    join(output, "report.json"),
    JSON.stringify({ ...report(), completedAt: new Date().toISOString() }, null, 2),
  );
  await Bun.write(join(output, "pages.json"), JSON.stringify([...pages]));
  console.log(JSON.stringify({ stage: "complete", counts, failures: failures.length }));
  return report();
}

if (import.meta.main) {
  if (Bun.argv.includes("--help"))
    console.log(
      "bun scripts/ops/audit-readers.ts [--origin URL] [--out DIR] [--frontier SQLITE] [--concurrency 1..8] [--embeds]",
    );
  else await auditReaders();
}
