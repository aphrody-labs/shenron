// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MangaPublicationQueue,
  qualifyBundle,
  consumeMangaBundle,
  runMangaWorker,
  Conflict,
  qualifyLiveMangaExtentApi,
  postMangaRevalidation,
  type WorkerConfig,
  type MangaBundle,
  type MangaWorkerPorts,
} from "./manga-publication-worker";
import { mangaDigest } from "./manga-cdn-projection";
import { wikiUpdateSnapshotHash as hash } from "../../apps/site/src/lib/wiki-update-precondition";
import {
  MANGA_REVALIDATION_CAPABILITIES,
  MANGA_REVALIDATION_SCHEMA,
  type MangaRevalidation,
} from "../../apps/site/src/lib/manga-publication-revalidate";
const roots: string[] = [];
afterEach(async () => {
  for (const path of roots.splice(0)) await rm(path, { recursive: true, force: true });
});
export async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "manga-consumer-"));
  roots.push(root);
  const pin = async (name: string, body: string) => {
    const path = join(root, name);
    await Bun.write(path, body);
    return { path, sha256: mangaDigest(body) };
  };
  const pages = [1, 2].map((n) => ({
    sourceUrl: `https://publisher.example/vol2/${n}.png`,
    publicPath: `/assets/manga/SOSH/vol2/${n}.png`,
    sha256: "a".repeat(64),
    size: 123,
    contentType: "image/png" as const,
    kind: "manga" as const,
    printedPages: [n],
  }));
  const input = await pin(
    "input.jsonl",
    JSON.stringify({
      crawl_id: "native",
      document_uid: "book2",
      canonical_url: "https://publisher.example/book2",
      source_domain: "publisher.example",
      category: "manga",
      http_status: 200,
      raw_checksum: "b".repeat(64),
      timestamp_utc: "2026-10-15T00:00:00Z",
      payload: {
        title_raw: "総集編 Legend 2",
        body_markdown: "9784081111664",
        embedded_media: pages.map((p) => ({ url: p.sourceUrl, type: "image" })),
      },
    }) + "\n",
  );
  const policy = await pin(
    "policy.json",
    JSON.stringify({
      version: 1,
      profile: "dbfr",
      sources: [
        {
          domain: "publisher.example",
          kind: "publisher",
          reviewed: true,
          evidence: "https://publisher.example/book2",
          rights: { ragPermitted: false, trainingPermitted: false, publicImagesPermitted: true },
        },
      ],
    }),
  );
  const media = await pin(
    "media.json",
    JSON.stringify(
      pages.map((p) => ({
        url: p.sourceUrl,
        sha256: p.sha256,
        size: p.size,
        contentType: p.contentType,
      })),
    ),
  );
  const config = await pin(
    "config.json",
    JSON.stringify({
      version: 1,
      input: input.path,
      policy: policy.path,
      media: media.path,
      job: join(root, "source"),
      store: {},
    }),
  );
  const expectedVolume = {
    id: 702,
    series: "SOSH",
    volumeNumber: 2,
    isbn: "978-4-08-111166-4",
    visible: true,
  };
  const expectedChapter = {
    id: 35002,
    series: "SOSH",
    volumeId: 702,
    chapterNumber: 2,
    title: "Legend 2",
    pages: [],
    visible: false,
  };
  const bundle: MangaBundle = {
    schema: "shenron-manga-publication-bundle/v1",
    series: "SOSH",
    volumeId: 702,
    volumeNumber: 2,
    chapterId: 35002,
    chapterNumber: 2,
    isbn: "9784081111664",
    activate: true,
    expectedVolume,
    expectedVolumeSha256: hash(expectedVolume),
    expectedChapter,
    expectedChapterSha256: hash(expectedChapter),
    source: {
      config,
      input,
      policy,
      media,
      documentUrl: "https://publisher.example/book2",
      editionToken: "総集編",
      volumeToken: "Legend 2",
      isbnToken: "9784081111664",
    },
    pages,
  };
  let current: Record<string, unknown> = structuredClone(expectedChapter),
    patches = 0,
    publications = 0;
  const resumes: boolean[] = [];
  const stages: string[] = [];
  const ports: MangaWorkerPorts = {
    qualify: async () => {
      stages.push("qualify");
    },
    source: async () => {
      stages.push("source");
      return { complete: true, publicActivation: false, revision: root };
    },
    assets: async () => {
      stages.push("assets");
      return { complete: true };
    },
    edit: async (requestedBundle, job) => {
      if (hash(current) !== requestedBundle.expectedChapterSha256) throw new Conflict("Staff edit");
      const { mkdir } = await import("node:fs/promises");
      await mkdir(job, { recursive: true, mode: 0o700 });
      await Bun.write(
        join(job, "before.json"),
        JSON.stringify([requestedBundle.expectedVolume, requestedBundle.expectedChapter]),
      );
      current = {
        ...current,
        pages: requestedBundle.pages.map((page) => page.publicPath),
        ...(requestedBundle.publicationExtent
          ? { readerExtent: requestedBundle.publicationExtent }
          : {}),
        visible: true,
      };
      patches++;
      stages.push("edit");
      return current;
    },
    publish: async (_b, _j, resume) => {
      resumes.push(resume);
      publications++;
      stages.push("catalogue");
      return { complete: true, indexSha256: "d".repeat(64) };
    },
    replica: async () => {
      stages.push("replica");
    },
    revalidate: async (_bundle, chapter, indexSha256) => {
      stages.push("revalidate");
      expect(chapter.id).toBe(current.id);
      expect(indexSha256).toBe("d".repeat(64));
      return { schema: MANGA_REVALIDATION_SCHEMA, action: "revalidated" };
    },
    verify: async () => {
      stages.push("verify");
      expect(current.visible).toBe(true);
    },
  };
  return {
    root,
    bundle,
    ports,
    patches: () => patches,
    publications: () => publications,
    resumes,
    stages,
    current: () => current,
    setCurrent: (row: Record<string, unknown>) => {
      current = row;
    },
  };
}
test("native edition/ISBN/embedded images are required and source file mutations fail closed", async () => {
  const f = await fixture();
  expect((await qualifyBundle(f.bundle)).pages).toHaveLength(2);
  const cover = structuredClone(f.bundle);
  cover.pages = cover.pages.map((p) => ({ ...p, kind: "cover" }));
  await expect(qualifyBundle(cover)).rejects.toThrow("Cover-only");
  const foreign = structuredClone(f.bundle);
  foreign.pages[0]!.sourceUrl = "https://dragonball.fandom.com/page.png";
  await expect(qualifyBundle(foreign)).rejects.toThrow();
  await Bun.write(f.bundle.source.input.path, "changed");
  await expect(qualifyBundle(f.bundle)).rejects.toThrow("Pinned input changed");
});
test("publication traverses canonical CAS, complete backup, readback, replica and reader then deduplicates", async () => {
  const f = await fixture(),
    db = new Database(":memory:"),
    q = new MangaPublicationQueue(db);
  const id = q.enqueue(f.bundle);
  expect(q.enqueue(f.bundle)).toBe(id);
  await consumeMangaBundle(q, q.next()!, join(f.root, id), f.ports);
  expect(f.patches()).toBe(1);
  expect(f.publications()).toBe(1);
  expect(q.next()).toBeNull();
  expect(f.stages).toEqual([
    "qualify",
    "source",
    "assets",
    "edit",
    "catalogue",
    "replica",
    "revalidate",
    "verify",
  ]);
  expect(await Bun.file(join(f.root, id, "editorial/before.json")).json()).toEqual([
    f.bundle.expectedVolume,
    f.bundle.expectedChapter,
  ]);
  db.close();
});

test("a reader awaiting qualification retains the catalogue across backoff before the next bundle", async () => {
  const a = await fixture(),
    b = await fixture(),
    db = new Database(":memory:"),
    q = new MangaPublicationQueue(db);
  const first = q.enqueue(a.bundle),
    second = q.enqueue(b.bundle);
  const verify = a.ports.verify;
  a.ports.verify = async () => {
    throw Error("Reader still cached");
  };
  const task = q.next()!;
  await expect(consumeMangaBundle(q, task, join(a.root, first), a.ports)).rejects.toThrow("cached");
  const now = Date.now();
  q.fail(task, Error("Reader still cached"), now);
  expect(q.rows()[0]).toMatchObject({ phase: "replicated" });
  expect(q.next(now)).toBeNull();
  expect(b.publications()).toBe(0);
  const resumed = q.next(now + 30001)!;
  expect(resumed.id).toBe(first);
  a.ports.verify = verify;
  await consumeMangaBundle(q, resumed, join(a.root, first), a.ports);
  expect(a.publications()).toBe(1);
  expect(a.patches()).toBe(1);
  expect(a.stages.filter((stage) => stage === "revalidate")).toHaveLength(2);
  expect(q.next(now + 30001)!.id).toBe(second);
  db.close();
});

test("missing runtime capability prevents even the private source writer and public assets", async () => {
  const f = await fixture(),
    db = new Database(":memory:"),
    q = new MangaPublicationQueue(db);
  const id = q.enqueue(f.bundle);
  f.ports.qualify = async () => {
    throw Error("Old site image");
  };
  await expect(consumeMangaBundle(q, q.next()!, join(f.root, id), f.ports)).rejects.toThrow(
    "Old site image",
  );
  expect(f.stages).toEqual([]);
  expect(q.next()!.phase).toBe("queued");
  expect(f.patches()).toBe(0);
  expect(f.publications()).toBe(0);
  db.close();
});

test("lost revalidation acknowledgement resumes without another upload, edit or replica mutation", async () => {
  const f = await fixture(),
    db = new Database(":memory:"),
    q = new MangaPublicationQueue(db);
  const id = q.enqueue(f.bundle),
    revalidate = f.ports.revalidate;
  f.ports.revalidate = async (...args) => {
    await revalidate(...args);
    throw Error("Lost invalidation ACK");
  };
  await expect(consumeMangaBundle(q, q.next()!, join(f.root, id), f.ports)).rejects.toThrow();
  expect(q.next()!.phase).toBe("replicated");
  expect(f.stages).not.toContain("verify");
  f.ports.revalidate = revalidate;
  await consumeMangaBundle(q, q.next()!, join(f.root, id), f.ports);
  expect(q.next()).toBeNull();
  expect(f.patches()).toBe(1);
  expect(f.publications()).toBe(1);
  expect(f.stages.filter((stage) => stage === "replica")).toHaveLength(1);
  expect(f.stages.filter((stage) => stage === "revalidate")).toHaveLength(2);
  db.close();
});

test("stale final reader retries invalidation rather than completing or republishing", async () => {
  const f = await fixture(),
    db = new Database(":memory:"),
    q = new MangaPublicationQueue(db);
  const id = q.enqueue(f.bundle),
    verify = f.ports.verify;
  f.ports.verify = async () => {
    throw Error("Old reader from another process or edge");
  };
  await expect(consumeMangaBundle(q, q.next()!, join(f.root, id), f.ports)).rejects.toThrow();
  expect(q.next()!.phase).toBe("replicated");
  f.ports.verify = verify;
  await consumeMangaBundle(q, q.next()!, join(f.root, id), f.ports);
  expect(f.stages.filter((stage) => stage === "revalidate")).toHaveLength(2);
  expect(f.patches()).toBe(1);
  expect(f.publications()).toBe(1);
  expect(q.next()).toBeNull();
  db.close();
});

test("runtime protocol uses a fixed authenticated POST and rejects stale capability or incorrect digest ACK", async () => {
  const calls: RequestInit[] = [];
  let reply: unknown = MANGA_REVALIDATION_CAPABILITIES,
    status = 200;
  const fetcher = Object.assign(
    async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      expect(url).toBe("https://dragonballfr.com/api/admin/manga/revalidate");
      calls.push(init!);
      return Response.json(reply, { status });
    },
    { preconnect: fetch.preconnect },
  );
  const probe = { schema: MANGA_REVALIDATION_SCHEMA, action: "capabilities" } as const;
  await postMangaRevalidation(probe, "existing-token", fetcher);
  expect(calls[0]).toMatchObject({
    method: "POST",
    redirect: "error",
    cache: "no-store",
    credentials: "omit",
  });
  expect(new Headers(calls[0]!.headers).get("authorization")).toBe("Bearer existing-token");
  expect(JSON.parse(calls[0]!.body as string)).toEqual(probe);
  reply = { ...MANGA_REVALIDATION_CAPABILITIES, edgeCacheInvalidated: true };
  await expect(postMangaRevalidation(probe, "existing-token", fetcher)).rejects.toThrow(
    "capability differs",
  );
  const input: MangaRevalidation = {
    schema: MANGA_REVALIDATION_SCHEMA,
    action: "revalidate" as const,
    volumeId: 702,
    chapterId: 35002,
    pageCount: 2,
    pagesSha256: "a".repeat(64),
    indexSha256: "b".repeat(64),
  };
  reply = {
    ...input,
    action: "revalidated",
    regeneration: "next-visit",
    localSourceCache: "refreshed",
    edgeCacheInvalidated: false,
    indexSha256: "c".repeat(64),
  };
  await expect(postMangaRevalidation(input, "existing-token", fetcher)).rejects.toThrow(
    "acknowledgement differs",
  );
  status = 404;
  await expect(postMangaRevalidation(probe, "existing-token", fetcher)).rejects.toThrow(
    "unavailable",
  );
});
test("lost public acknowledgement resumes its existing owner and never repeats the canonical edit", async () => {
  const f = await fixture(),
    db = new Database(":memory:"),
    q = new MangaPublicationQueue(db),
    id = q.enqueue(f.bundle);
  const publish = f.ports.publish;
  f.ports.publish = async (...args) => {
    await publish(...args);
    throw Error("observation interrupted");
  };
  await expect(consumeMangaBundle(q, q.next()!, join(f.root, id), f.ports)).rejects.toThrow();
  f.ports.publish = publish;
  await consumeMangaBundle(q, q.next()!, join(f.root, id), f.ports);
  expect(f.resumes).toEqual([false, true]);
  expect(f.patches()).toBe(1);
  expect(q.next()).toBeNull();
  db.close();
});
test("lost assets acknowledgement resumes assets before any editorial mutation", async () => {
  const f = await fixture(),
    db = new Database(":memory:"),
    q = new MangaPublicationQueue(db),
    id = q.enqueue(f.bundle);
  const assets = f.ports.assets,
    resumes: boolean[] = [];
  f.ports.assets = async (bundle, job, resume) => {
    resumes.push(resume);
    await assets(bundle, job, resume);
    throw Error("lost assets acknowledgement");
  };
  await expect(consumeMangaBundle(q, q.next()!, join(f.root, id), f.ports)).rejects.toThrow();
  expect(f.patches()).toBe(0);
  f.ports.assets = async (bundle, job, resume) => {
    resumes.push(resume);
    return assets(bundle, job, resume);
  };
  await consumeMangaBundle(q, q.next()!, join(f.root, id), f.ports);
  expect(resumes).toEqual([false, true]);
  expect(f.patches()).toBe(1);
  expect(q.next()).toBeNull();
  db.close();
});
test("concurrent editorial changes quarantine the task without overwriting the row", async () => {
  const f = await fixture(),
    db = new Database(":memory:"),
    q = new MangaPublicationQueue(db),
    id = q.enqueue(f.bundle);
  f.setCurrent({ ...f.bundle.expectedChapter, title: "staff edit" });
  const task = q.next()!;
  try {
    await consumeMangaBundle(q, task, join(f.root, id), f.ports);
  } catch (error) {
    q.fail(task, error);
  }
  expect(f.patches()).toBe(0);
  expect(f.publications()).toBe(0);
  expect(q.next()).toBeNull();
  expect(q.rows()[0]).toMatchObject({ phase: "conflict", error: "CAS_CONFLICT" });
  db.close();
});

test("one bounded worker cycle quarantines malformed inputs and completes an independent qualified lot", async () => {
  const f = await fixture(),
    outbox = join(f.root, "outbox"),
    job = join(f.root, "job");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(outbox, { mode: 0o700 });
  await Bun.write(join(outbox, "bad.json"), "{}");
  await Bun.write(join(outbox, "good.json"), JSON.stringify(f.bundle));
  const config = {
    version: 1,
    job,
    outbox,
    allowedSeries: ["SOSH"],
    replica: { kind: "local", hostname: "unused" },
    publication: { targetUrl: "https://dragonballfr.com/publications/manga-catalogue" },
  } as WorkerConfig;
  await runMangaWorker(config, f.ports, true);
  const status = await Bun.file(join(job, "status.json")).json();
  expect(status.tasks[0].phase).toBe("complete");
  expect(status.completeCatalogue).toBe(false);
  expect(f.patches()).toBe(1);
});

test("real CLI finishes an empty handoff and candidate cycle without an initialization cycle", async () => {
  const f = await fixture();
  const config = {
    version: 1,
    job: join(f.root, "runtime"),
    outbox: join(f.root, "outbox"),
    candidateInbox: join(f.root, "candidates"),
    handoff: {
      inbox: join(f.root, "incoming"),
      root: join(f.root, "imported"),
      configSha256: "a".repeat(64),
      policySha256: "b".repeat(64),
    },
    allowedSeries: ["SOSH"],
    replica: { kind: "local", hostname: "unused" },
    publication: { targetUrl: "https://dragonballfr.com/publications/manga-catalogue" },
  };
  const path = join(f.root, "worker-config.json");
  await Bun.write(path, JSON.stringify(config));
  const child = Bun.spawn(
    [process.execPath, join(import.meta.dir, "manga-publication-worker.ts"), "once", path],
    { stdout: "pipe", stderr: "pipe", timeout: 10000 },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect({ code, stdout, stderr }).toEqual({ code: 0, stdout: "", stderr: "" });
  expect(await Bun.file(join(config.job, "status.json")).json()).toMatchObject({
    tasks: [],
    candidates: [],
    handoffs: [],
    completeCatalogue: false,
  });
});
test("explicit preview survives canonical editorial CAS without claiming complete pagination", async () => {
  const f = await fixture();
  f.bundle.publicationExtent = {
    kind: "preview",
    sourceUrl: f.bundle.source.documentUrl,
    fullVolumePages: null,
  };
  const db = new Database(":memory:"),
    q = new MangaPublicationQueue(db);
  q.enqueue(f.bundle);
  await consumeMangaBundle(q, q.next()!, join(f.root, "preview"), f.ports);
  expect(f.current()).toMatchObject({
    readerExtent: f.bundle.publicationExtent,
  });
  expect(q.next()).toBeNull();
  db.close();
});

test("publication capability follows a live readable chapter and refuses an older API before public staging", async () => {
  const calls: string[] = [];
  let current: Record<string, unknown> = { id: 99 };
  const read = async (path: string) => {
    calls.push(path);
    if (path === "/api/manga")
      return {
        catalog: [
          { id: 1, readableHere: false },
          { id: 2, readableHere: true },
        ],
      };
    if (path === "/api/manga/volume/2") return { chapters: [{ id: 99 }] };
    if (path === "/api/manga/chapter/99") return current;
    throw Error("Unexpected route");
  };
  await expect(qualifyLiveMangaExtentApi(read)).rejects.toThrow("does not yet support");
  current = { id: 99, readerExtent: { kind: "unknown" } };
  await qualifyLiveMangaExtentApi(read);
  expect(calls).toEqual([
    "/api/manga",
    "/api/manga/volume/2",
    "/api/manga/chapter/99",
    "/api/manga",
    "/api/manga/volume/2",
    "/api/manga/chapter/99",
  ]);
});
