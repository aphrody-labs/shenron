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
