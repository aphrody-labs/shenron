// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { executeTask } from "./manga-source-pool";
import { projectPoolReceipts, projectionDigest } from "./manga-source-pool-projection";

test("BOM receipt reconstructs exact bytes through projection and keeps hash rejection", async () => {
  const job = await mkdtemp(join(tmpdir(), "manga-bom-"));
  try {
    await mkdir(join(job, "receipts"));
    const id = "b".repeat(64);
    const url = "https://www.glenat.com/sites/default/files/liseuse/9782723454698/";
    const bytes = new TextEncoder().encode(
      "\uFEFF<html><title>Nekomajin</title><body>ISBN9782723454698</body></html>",
    );
    const fetcher = (async (input: URL | string) =>
      String(input).endsWith("/robots.txt")
        ? new Response("", { status: 404 })
        : new Response(bytes, { headers: { "content-type": "text/html" } })) as typeof fetch;
    const receipt = await executeTask(
      {
        id,
        url,
        host: "www.glenat.com",
        kind: "discovery",
        depth: 0,
        attempts: 1,
        series: "NEKOMAJIN",
        volumeId: 799,
      },
      job,
      0,
      fetcher,
    );
    expect(receipt.state).toBe("done");
    if (!("body" in receipt) || typeof receipt.body !== "string") throw Error("Missing body");
    expect(new TextEncoder().encode(receipt.body)).toEqual(bytes);
    expect(projectionDigest(receipt.body)).toBe(receipt.sha256!);
    const jsonBytes = new TextEncoder().encode('\uFEFF{"source":"official"}');
    const jsonReceipt = await executeTask(
      {
        id,
        url,
        host: "www.glenat.com",
        kind: "discovery",
        depth: 0,
        attempts: 1,
        series: "NEKOMAJIN",
        volumeId: 799,
      },
      job,
      0,
      (async (input: URL | string) =>
        String(input).endsWith("/robots.txt")
          ? new Response("", { status: 404 })
          : new Response(jsonBytes, {
              headers: { "content-type": "application/json" },
            })) as typeof fetch,
    );
    if (!("body" in jsonReceipt) || typeof jsonReceipt.body !== "string")
      throw Error("Missing JSON body");
    expect(new TextEncoder().encode(jsonReceipt.body)).toEqual(jsonBytes);
    expect("json" in jsonReceipt && jsonReceipt.json).toEqual({ source: "official" });
    const path = join(job, "receipts", id + ".json");
    await Bun.write(path, JSON.stringify(receipt));
    const db = new Database(join(job, "frontier.sqlite"));
    db.exec(
      "CREATE TABLE pool_tasks(id TEXT,url TEXT,kind TEXT,series TEXT,volumeId INTEGER,receipt TEXT,state TEXT)",
    );
    db.query("INSERT INTO pool_tasks VALUES(?,?,?,?,?,?,?)").run(
      id,
      url,
      "discovery",
      "NEKOMAJIN",
      799,
      path,
      "done",
    );
    db.close();
    const options = { indexer: async () => ({ indexed: 1 }), minimumFreeBytes: 0 };
    expect((await projectPoolReceipts(job, options)).projected).toBe(1);
    await Bun.write(path, JSON.stringify({ ...receipt, body: receipt.body.slice(1) }));
    expect((await projectPoolReceipts(job, options)).projected).toBe(0);
    const quarantine = await Bun.file(
      join(job, "derived", "candidate-quarantine", id + ".json"),
    ).json();
    expect(quarantine.reason).toBe("capture-body-sha256-differs");
  } finally {
    await rm(job, { recursive: true, force: true });
  }
});

test("actual EUC-JP bytes are quarantined without fabricated UTF-8 body or derived URLs", async () => {
  const job = await mkdtemp(join(tmpdir(), "manga-eucjp-"));
  try {
    await mkdir(join(job, "receipts"));
    const id = "e".repeat(64);
    const url = "https://books.rakuten.co.jp/rb/14606453/";
    // 日本語 encoded as EUC-JP, followed by a link that must not enter the frontier.
    const bytes = new Uint8Array([
      ...new TextEncoder().encode('<html><meta charset="EUC-JP"><body>'),
      0xc6,
      0xfc,
      0xcb,
      0xdc,
      0xb8,
      0xec,
      ...new TextEncoder().encode(
        '<a href="https://books.rakuten.co.jp/rb/123/">x</a></body></html>',
      ),
    ]);
    expect(new TextDecoder("euc-jp", { fatal: true }).decode(bytes)).toContain("日本語");
    const receipt = await executeTask(
      {
        id,
        url,
        host: "books.rakuten.co.jp",
        kind: "discovery",
        depth: 0,
        attempts: 1,
        series: null,
        volumeId: null,
      },
      job,
      0,
      (async (input: URL | string) =>
        String(input).endsWith("/robots.txt")
          ? new Response("", { status: 404 })
          : new Response(bytes, {
              headers: { "content-type": "text/html; charset=EUC-JP" },
            })) as typeof fetch,
    );
    expect(receipt.state).toBe("done");
    expect(receipt).toMatchObject({
      bytes: bytes.length,
      sha256: projectionDigest(bytes),
      textEncoding: "euc-jp",
      textCaptureError: "unsupported-text-charset",
      candidates: [],
      children: [],
    });
    expect("body" in receipt && receipt.body).toBeUndefined();
    const path = join(job, "receipts", id + ".json");
    await Bun.write(path, JSON.stringify(receipt));
    const db = new Database(join(job, "frontier.sqlite"));
    db.exec(
      "CREATE TABLE pool_tasks(id TEXT,url TEXT,kind TEXT,series TEXT,volumeId INTEGER,receipt TEXT,state TEXT)",
    );
    db.query("INSERT INTO pool_tasks VALUES(?,?,?,?,?,?,?)").run(
      id,
      url,
      "discovery",
      null,
      null,
      path,
      "done",
    );
    db.close();
    const result = await projectPoolReceipts(job, {
      indexer: async () => {
        throw Error("Must not index lossy text");
      },
      minimumFreeBytes: 0,
    });
    expect(result.projected).toBe(0);
    expect(result.quarantined).toBe(1);
    expect(
      await Bun.file(join(job, "derived", "candidate-quarantine", id + ".json")).json(),
    ).toMatchObject({ reason: "unsupported-text-charset", encoding: "euc-jp" });
  } finally {
    await rm(job, { recursive: true, force: true });
  }
});

test("meta-only legacy charset and invalid UTF-8 fail closed", async () => {
  for (const fixture of [
    {
      bytes: new TextEncoder().encode('<meta charset="EUC-JP">'),
      error: "unsupported-text-charset",
    },
    { bytes: new Uint8Array([0xc6, 0xfc]), error: "lossy-text-decoding" },
  ]) {
    const receipt = await executeTask(
      {
        id: "f".repeat(64),
        url: "https://books.rakuten.co.jp/rb/123/",
        host: "books.rakuten.co.jp",
        kind: "discovery",
        depth: 0,
        attempts: 1,
        series: null,
        volumeId: null,
      },
      tmpdir(),
      0,
      (async (input: URL | string) =>
        String(input).endsWith("/robots.txt")
          ? new Response("", { status: 404 })
          : new Response(fixture.bytes, {
              headers: { "content-type": "text/html" },
            })) as typeof fetch,
    );
    expect(receipt).toMatchObject({
      textCaptureError: fixture.error,
      candidates: [],
      children: [],
      sha256: projectionDigest(fixture.bytes),
    });
    expect("body" in receipt && receipt.body).toBeUndefined();
  }
});
