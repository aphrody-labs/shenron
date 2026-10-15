// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { chmod, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fixture } from "./manga-publication-worker.test";
import {
  exportMangaHandoff,
  importMangaHandoff,
  importPendingMangaHandoffs,
} from "./manga-pool-handoff";
import { mangaDigest } from "./manga-cdn-projection";

async function poolFixture() {
  const f = await fixture(),
    pool = join(f.root, "pool");
  for (const dir of ["derived/candidate-inbox", "acquired", "receipts"])
    await mkdir(join(pool, dir), { recursive: true, mode: 0o700 });
  const candidate = {
    schema: "shenron-manga-acquisition-candidate/v1",
    series: f.bundle.series,
    volumeNumber: f.bundle.volumeNumber,
    chapterNumber: f.bundle.chapterNumber,
    isbn: f.bundle.isbn,
    source: { ...f.bundle.source },
    expectedImages: 2,
    pages: f.bundle.pages.map(({ sourceUrl, kind, printedPages }) => ({
      sourceUrl,
      kind,
      printedPages,
    })),
  };
  delete (candidate.source as Partial<typeof candidate.source>).media;
  await Bun.write(join(pool, "derived/candidate-inbox/one.json"), JSON.stringify(candidate));
  const db = new Database(join(pool, "frontier.sqlite"));
  db.exec("CREATE TABLE pool_tasks(kind TEXT,state TEXT,url TEXT,receipt TEXT)");
  for (const [i, page] of candidate.pages.entries()) {
    const body = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, i]),
      sha256 = mangaDigest(body),
      assetPath = join(pool, "acquired", sha256),
      receipt = join(pool, "receipts", sha256 + ".json");
    await Bun.write(assetPath, body);
    await Bun.write(
      receipt,
      JSON.stringify({
        sourceUrl: page.sourceUrl,
        httpStatus: 200,
        sha256,
        bytes: body.length,
        contentType: "image/png",
        assetPath,
      }),
    );
    db.query("INSERT INTO pool_tasks VALUES ('acquisition','done',?,?)").run(
      page.sourceUrl,
      receipt,
    );
  }
  db.close();
  const out = join(f.root, "export"),
    root = join(f.root, "import");
  return {
    ...f,
    pool,
    out,
    root,
    candidate,
    config: {
      inbox: out,
      root,
      configSha256: candidate.source.config.sha256,
      policySha256: candidate.source.policy.sha256,
    },
  };
}

test("sealed pool handoff imports exact acquired bytes, rebases pins, and replays without duplicates", async () => {
  const f = await poolFixture(),
    exported = await exportMangaHandoff(f.pool, f.out);
  if (!exported.descriptorPath) throw Error("Expected archive");
  expect(await importMangaHandoff(exported.descriptorPath, f.config)).toMatchObject({
    replay: false,
    candidates: 1,
    images: 2,
  });
  expect(await importMangaHandoff(exported.descriptorPath, f.config)).toMatchObject({
    replay: true,
  });
  const names = await Array.fromAsync(
    new Bun.Glob("*.json").scan({ cwd: join(f.root, "derived/candidate-inbox") }),
  );
  const candidate = await Bun.file(join(f.root, "derived/candidate-inbox", names[0]!)).json();
  expect(candidate.source.input.path.startsWith(join(f.root, "inputs"))).toBe(true);
  expect(mangaDigest(await Bun.file(candidate.source.input.path).bytes())).toBe(
    candidate.source.input.sha256,
  );
  await exported.ack?.();
  expect(await exportMangaHandoff(f.pool, f.out)).toMatchObject({ empty: true });
});

test("handoff owner pins reject before acquisition state and archive tampering cannot import", async () => {
  const f = await poolFixture(),
    exported = await exportMangaHandoff(f.pool, f.out);
  if (!exported.descriptorPath || !exported.archivePath) throw Error("Expected archive");
  await expect(
    importMangaHandoff(exported.descriptorPath, { ...f.config, configSha256: "0".repeat(64) }),
  ).rejects.toThrow("owner pins");
  expect(await Bun.file(join(f.root, "frontier.sqlite")).exists()).toBe(false);
  await Bun.write(exported.archivePath, "tampered");
  await expect(importMangaHandoff(exported.descriptorPath, f.config)).rejects.toThrow(
    "SHA differs",
  );
});

test("invalid handoff is quarantined visibly and cannot starve later valid descriptors", async () => {
  const f = await poolFixture(),
    exported = await exportMangaHandoff(f.pool, f.out);
  if (!exported.descriptorPath) throw Error("Expected archive");
  const bad = join(f.out, "0".repeat(64) + ".handoff.json");
  await Bun.write(bad, "{}");
  await chmod(bad, 0o600);
  const first = await importPendingMangaHandoffs(f.config);
  expect(first.some((x) => "reason" in x)).toBe(true);
  expect(first.some((x) => "replay" in x && x.replay === false)).toBe(true);
  expect(await importPendingMangaHandoffs(f.config)).toEqual([]);
});

test("invalid source configurations cannot poison a healthy handoff or export embedded credentials", async () => {
  const f = await poolFixture();
  const bad = structuredClone(f.candidate),
    body = JSON.stringify({
      version: 1,
      store: { secretAccessKey: "fixture-secret-never-export" },
    });
  bad.source.config = { path: join(f.pool, "bad-config.json"), sha256: mangaDigest(body) };
  await Bun.write(bad.source.config.path, body);
  await Bun.write(join(f.pool, "derived/candidate-inbox/bad.json"), JSON.stringify(bad));
  const exported = await exportMangaHandoff(f.pool, f.out);
  if (!exported.archivePath || !exported.descriptorPath)
    throw Error("Healthy acquisition must progress");
  expect(
    new TextDecoder()
      .decode(await Bun.file(exported.archivePath).bytes())
      .includes("fixture-secret-never-export"),
  ).toBe(false);
  expect(await importMangaHandoff(exported.descriptorPath, f.config)).toMatchObject({
    candidates: 1,
    images: 2,
  });
  expect(
    (await Array.fromAsync(new Bun.Glob("*.json").scan({ cwd: join(f.out, "quarantine") }))).length,
  ).toBe(1);
});
