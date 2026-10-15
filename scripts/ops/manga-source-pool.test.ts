// SPDX-License-Identifier: Apache-2.0
import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdtemp, rm, chmod } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  MangaSourceFrontier,
  reconcileMangaCatalog,
  discoveredPoolUrls,
  retainPoolCandidates,
  poolUrl,
  retryDelay,
  POOL_HOST_DELAY_MS,
  POOL_HOST_DAILY_LIMIT,
  defaultPoolCapabilities,
  loadPoolCapabilities,
  executeTask,
} from "./manga-source-pool";

const volume = (id: number, series = "SOSH", readableHere = false) => ({
  id,
  series,
  readableHere,
  isbn: "978-4-08-111166-4",
});
const task = (url = "https://dragonballfr.com/api/manga", kind = "catalog" as const) => ({
  kind,
  url,
  depth: 0,
  series: null,
  volumeId: null,
});

test("an explicitly unavailable search capability is quarantined without network or CLI calls", async () => {
  const capabilities = {
    ...defaultPoolCapabilities,
    search: {
      ...defaultPoolCapabilities.search,
      state: "unavailable" as const,
      reason: "bun-search-cli-unsupported; native Google challenge retained",
    },
  };
  let requests = 0;
  const result = await executeTask(
    {
      ...task(),
      id: "google",
      kind: "google",
      host: "www.google.com",
      attempts: 1,
      url: "https://www.google.com/search?q=dragonball",
    },
    "/tmp/unused-search-capability",
    0,
    (async () => {
      requests++;
      throw Error("Network forbidden");
    }) as unknown as typeof fetch,
    undefined,
    capabilities,
  );
  expect(result.state).toBe("capability_unavailable");
  expect("reason" in result && result.reason).toContain("unsupported");
  expect(requests).toBe(0);
  const db = new Database(":memory:");
  const frontier = new MangaSourceFrontier(db);
  try {
    frontier.enqueue(
      { ...task(), kind: "google", url: "https://www.google.com/search?q=dragonball" },
      1,
    );
    const search = frontier.claim([], 1)!;
    frontier.settle(search, "capability_unavailable", "receipt", capabilities.search.reason, 1);
    frontier.enqueue(task(), 1);
    expect(frontier.claim([], 2)?.kind).toBe("catalog");
    expect(frontier.counts().capability_unavailable).toBe(1);
  } finally {
    db.close();
  }
});

test("capability overrides pin the exact installed runtime and refuse public or changed configuration", async () => {
  const root = await mkdtemp(join(tmpdir(), "manga-capabilities-"));
  const path = join(root, "capabilities.json");
  try {
    await Bun.write(path, JSON.stringify(defaultPoolCapabilities));
    await chmod(path, 0o600);
    expect(await loadPoolCapabilities(path)).toEqual(defaultPoolCapabilities);
    await chmod(path, 0o644);
    await expect(loadPoolCapabilities(path)).rejects.toThrow("Private bounded");
    await chmod(path, 0o600);
    await Bun.write(
      path,
      JSON.stringify({
        ...defaultPoolCapabilities,
        runtime: { ...defaultPoolCapabilities.runtime, revision: "unqualified" },
      }),
    );
    await expect(loadPoolCapabilities(path)).rejects.toThrow("exact qualified runtime");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("durable frontier survives process restart and refuses recovery of live leases", async () => {
  const root = await mkdtemp(join(tmpdir(), "manga-pool-"));
  const path = join(root, "frontier.sqlite");
  let db = new Database(path, { create: true });
  let frontier = new MangaSourceFrontier(db);
  try {
    expect(frontier.enqueue(task(), 100)).toBe(true);
    expect(frontier.enqueue(task(), 101)).toBe(false);
    const claimed = frontier.claim([], 100)!;
    expect(claimed.kind).toBe("catalog");
    expect(claimed.attempts).toBe(1);
    db.close();
    db = new Database(path);
    frontier = new MangaSourceFrontier(db);
    expect(() => frontier.recover(false)).toThrow("Live owner");
    expect(frontier.recover(true)).toBe(1);
    expect(frontier.claim([], 200)).toBeNull();
    const resumed = frontier.claim([], 100 + POOL_HOST_DELAY_MS)!;
    expect(resumed.id).toBe(claimed.id);
    expect(resumed.attempts).toBe(2);
    frontier.settle(resumed, "done", "receipt.json", null, 2200);
    expect(frontier.claim([], 2201)).toBeNull();
    expect(frontier.counts().done).toBe(1);
  } finally {
    db.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("host cooldown and daily reservations survive restart and reset only at the UTC day boundary", () => {
  const db = new Database(":memory:");
  let frontier = new MangaSourceFrontier(db);
  try {
    const start = Date.parse("2026-10-15T01:00:00Z");
    frontier.enqueue(task(), start);
    frontier.enqueue({ ...task(), url: "https://dragonballfr.com/api/manga/volume/701" }, start);
    frontier.meta("host-budget:dragonballfr.com:2026-10-15", POOL_HOST_DAILY_LIMIT - 1);
    const last = frontier.claim([], start)!;
    frontier.settle(last, "done", "receipt", null, start);
    frontier = new MangaSourceFrontier(db);
    expect(frontier.claim([], start + 1)).toBeNull();
    expect(frontier.claim([], start + POOL_HOST_DELAY_MS)).toBeNull();
    const tomorrow = frontier.claim([], Date.parse("2026-10-16T00:00:00Z"));
    expect(tomorrow?.host).toBe("dragonballfr.com");
    expect(frontier.meta("host-budget:dragonballfr.com:2026-10-16")).toBe(1);
  } finally {
    db.close();
  }
});

test("full volume media exceed the navigation budget without losing order or permitting unbounded recursion", () => {
  const db = new Database(":memory:");
  const frontier = new MangaSourceFrontier(db);
  try {
    frontier.enqueue(
      { ...task(), kind: "discovery", url: "https://archive.org/metadata/volume" },
      1,
    );
    const parent = frontier.claim([], 1)!;
    const links = Array.from(
      { length: 300 },
      (_, n) => `<a href='/metadata/nav-${n}'>next</a>`,
    ).join("");
    const images = Array.from(
      { length: 512 },
      (_, n) => `<img src='/download/volume/${n + 1}.jpg'>`,
    ).join("");
    const urls = discoveredPoolUrls(links + images, parent.url);
    expect(urls.filter((url) => url.endsWith(".jpg"))).toHaveLength(512);
    expect(urls.filter((url) => !url.endsWith(".jpg"))).toHaveLength(150);
    const result = retainPoolCandidates(frontier, parent, urls, 2);
    expect(result.queued).toBe(662);
    const tasks = db
      .query<{ url: string }, []>(
        "SELECT url FROM pool_tasks WHERE kind='acquisition' ORDER BY rowid",
      )
      .all();
    expect(tasks).toHaveLength(512);
    expect(tasks.at(-1)?.url).toBe("https://archive.org/download/volume/512.jpg");
    expect(
      discoveredPoolUrls(
        Array.from({ length: 3000 }, (_, n) => `https://archive.org/download/volume/${n}.jpg`),
        parent.url,
      ),
    ).toHaveLength(2500);
  } finally {
    db.close();
  }
});

test("host exclusion and provider circuit prevent retries from becoming an antibot bypass", () => {
  const db = new Database(":memory:");
  const frontier = new MangaSourceFrontier(db);
  try {
    frontier.enqueue(task(), 1);
    frontier.enqueue(
      { ...task(), url: "https://www.google.com/search?q=dragon", kind: "google" },
      1,
    );
    expect(frontier.claim(["dragonballfr.com", "www.google.com"], 1)).toBeNull();
    const google = frontier.claim(["dragonballfr.com"], 1)!;
    frontier.settle(google, "provider_blocked", "blocked.json", null, 1);
    expect(frontier.claim(["dragonballfr.com"], 3600000)).toBeNull();
    expect(frontier.claim(["dragonballfr.com"], 86400002)?.host).toBe("www.google.com");
    expect(retryDelay(1)).toBe(30000);
    expect(retryDelay(100)).toBeLessThanOrEqual(6 * 3600000);
  } finally {
    db.close();
  }
});

test("reconciliation covers every series, distinguishes missing volumes and preserves real identities", () => {
  const db = new Database(":memory:");
  const frontier = new MangaSourceFrontier(db);
  try {
    const catalog = reconcileMangaCatalog(
      {
        catalog: [volume(701), volume(2, "DB", true), volume(3, "DBS")],
        series: [{ pages: 381 }, { pages: 200 }],
      },
      frontier,
      10,
    );
    expect(catalog).toEqual({
      volumes: 3,
      readableVolumes: 1,
      missingVolumeIds: [3, 701],
      listedPages: 581,
    });
    const rows = db
      .query<{ kind: string; volumeId: number }, []>(
        "SELECT kind,volumeId FROM pool_tasks WHERE kind='volume'",
      )
      .all();
    expect(rows.map((row) => row.volumeId).toSorted((a, b) => a - b)).toEqual([2, 3, 701]);
    const count = db
      .query<{ total: number }, []>("SELECT count(*) AS total FROM pool_tasks")
      .get()!.total;
    reconcileMangaCatalog(
      { catalog: [volume(701), volume(2, "DB", true), volume(3, "DBS")], series: [] },
      frontier,
      11,
    );
    expect(
      db.query<{ total: number }, []>("SELECT count(*) AS total FROM pool_tasks").get()!.total,
    ).toBe(count);
    expect(() => reconcileMangaCatalog({ catalog: [] }, frontier)).toThrow();
  } finally {
    db.close();
  }
});

test("recursive preview/media candidates are queued only on reviewed hosts and retain unknown providers", () => {
  const db = new Database(":memory:");
  const frontier = new MangaSourceFrontier(db);
  try {
    frontier.enqueue(
      { ...task(), url: "https://www.shueisha.co.jp/books/legend2", kind: "discovery" },
      1,
    );
    const parent = frontier.claim([], 1)!;
    const urls = discoveredPoolUrls(
      {
        organic: [{ url: "https://www.shueisha.co.jp/preview/legend2" }],
        html: '<a href="/sample/legend2">試し読み</a><img src="https://unknown-publisher.example/02.jpg">',
        scan: "https://archive.org/download/real-identifier/02.jpg",
      },
      parent.url,
    );
    const result = retainPoolCandidates(frontier, parent, urls, 2);
    expect(result.queued).toBe(3);
    expect(result.review).toBe(1);
    expect(
      db.query<{ kind: string }, []>("SELECT kind FROM pool_tasks WHERE kind='acquisition'").all(),
    ).toHaveLength(1);
    expect(
      db
        .query<{ state: string }, []>(
          "SELECT state FROM pool_candidates WHERE state='review_required'",
        )
        .all(),
    ).toHaveLength(1);
    retainPoolCandidates(
      frontier,
      { ...parent, depth: 3 },
      ["https://www.shueisha.co.jp/books/other"],
      3,
    );
    expect(
      db.query<{ url: string }, []>("SELECT url FROM pool_tasks WHERE url LIKE '%other'").all(),
    ).toHaveLength(0);
    expect(() => poolUrl("https://dragonball.fandom.com/wiki/Manga")).toThrow();
    expect(() => poolUrl("https://user:secret@www.shueisha.co.jp/books/")).toThrow();
    expect(() => poolUrl("http://127.0.0.1/private")).toThrow();
  } finally {
    db.close();
  }
});

test("catalogue reconciliation retains primary publisher seeds and Japanese bibliography for readable editions", () => {
  const db = new Database(":memory:");
  const frontier = new MangaSourceFrontier(db);
  try {
    reconcileMangaCatalog(
      {
        catalog: [volume(702, "SOSH", true), { ...volume(729, "DBSD"), isbn: "9782344012949" }],
        series: [],
      },
      frontier,
      10,
    );
    const urls = db
      .query<{ url: string }, []>("SELECT url FROM pool_tasks")
      .all()
      .map((r) => r.url);
    expect(urls).toContain(
      "https://books.shueisha.co.jp/items/contents.html?isbn=978-4-08-111166-4",
    );
    expect(urls).toContain("https://www.books.or.jp/book-details/9784081111664");
    expect(urls).toContain(
      "https://www.glenat.com/glenat-manga/dragon-ball-sd-tome-02-9782344012949/",
    );
    expect(urls.some((url) => url.includes("book-details/9782344012949"))).toBe(false);
  } finally {
    db.close();
  }
});

test("eight real Bun Workers load the pool entry exactly once and identify as workers", async () => {
  const workers: Worker[] = [];
  try {
    const messages = await Promise.all(
      Array.from(
        { length: 8 },
        (_, slot) =>
          new Promise<{ kind: string; isMainThread: boolean; runtime: string }>(
            (resolve, reject) => {
              const worker = new Worker(new URL("./manga-source-pool.ts", import.meta.url).href, {
                name: `pool-gate-${slot}`,
              });
              workers.push(worker);
              const timer = setTimeout(
                () => reject(Error("Actual worker readiness deadline")),
                10000,
              );
              worker.onmessage = ({ data }) => {
                clearTimeout(timer);
                resolve(data);
              };
              worker.onerror = (event) => {
                clearTimeout(timer);
                reject(Error(event.message));
              };
            },
          ),
      ),
    );
    expect(messages).toHaveLength(8);
    for (const message of messages) {
      expect(message.kind).toBe("online");
      expect(message.isMainThread).toBe(false);
      expect(message.runtime).toBe(process.execPath);
    }
  } finally {
    for (const worker of workers) await worker.terminate();
  }
}, 15000);

test("a discovered scan writes actual bytes before producing pending canonical review evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "manga-acquisition-"));
  try {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const fetcher = (async (input: URL | string) =>
      String(input).endsWith("/robots.txt")
        ? new Response("absent", { status: 404 })
        : new Response(bytes, {
            headers: { "content-type": "image/jpeg" },
          })) as unknown as typeof fetch;
    const result = await executeTask(
      {
        id: "scan",
        kind: "acquisition",
        url: "https://archive.org/download/reviewed-book/001.jpg",
        host: "archive.org",
        depth: 2,
        attempts: 1,
        series: "SOSH",
        volumeId: 702,
      },
      join(root, "new", "attempt"),
      0,
      fetcher,
    );
    expect(result.state).toBe("done");
    expect("publicationEligible" in result && result.publicationEligible).toBe(false);
    expect("review" in result && result.review).toBe("pending");
    const path = "assetPath" in result ? result.assetPath : null;
    expect(typeof path).toBe("string");
    expect(await Bun.file(path!).bytes()).toEqual(bytes);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("archive and owned inventory recursion follow real returned identities and refuse restricted archive files", async () => {
  const { structuredPoolUrls } = await import("./manga-source-pool");
  expect(
    structuredPoolUrls(
      { response: { docs: [{ identifier: "actual-sosh-scan" }] } },
      "https://archive.org/advancedsearch.php?q=sosh",
    ),
  ).toEqual(["https://archive.org/metadata/actual-sosh-scan"]);
  const files = { files: [{ name: "actual scan.pdf" }, { name: "secret.jpg", private: "true" }] };
  expect(structuredPoolUrls(files, "https://archive.org/metadata/actual-sosh-scan")).toEqual([
    "https://archive.org/download/actual-sosh-scan/actual%20scan.pdf",
  ]);
  expect(
    structuredPoolUrls(
      { ...files, is_restricted: true },
      "https://archive.org/metadata/actual-sosh-scan",
    ),
  ).toEqual([]);
  const entries = {
    page: {
      totalPages: 1,
      entries: [
        { path: "/wiki/databooks/soshuhen-legend-02/001.jpg", mime: "image/jpeg" },
        { path: "/unrelated/movie.mp4", mime: "video/mp4" },
      ],
    },
  };
  expect(
    structuredPoolUrls(
      entries,
      "https://dragonballfr.com/api/catalog?category=assets&path=%2Fwiki%2Fdatabooks%2F",
    ),
  ).toEqual(["https://dragonballfr.com/assets/wiki/databooks/soshuhen-legend-02/001.jpg"]);
});
