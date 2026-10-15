import { expect, test } from "bun:test";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { copyRuntimeDirectory, copyRuntimeFile } from "./bot-runtime-assets";

test("sealed runtime payloads remain readable outside their build UID under a restrictive umask", () => {
  const root = mkdtempSync(join(tmpdir(), "shenron-runtime-permissions-"));
  const previousUmask = process.umask(0o077);
  try {
    const source = join(root, "source");
    const output = join(root, "output");
    mkdirSync(source);
    mkdirSync(output);
    writeFileSync(join(source, "binding.node"), "native fixture bytes");
    writeFileSync(join(output, "binding.node"), "old restrictive file");
    chmodSync(join(output, "binding.node"), 0o600);
    copyRuntimeFile(join(source, "binding.node"), join(output, "binding.node"));
    mkdirSync(join(source, "migrations", "meta"), { recursive: true });
    writeFileSync(join(source, "migrations", "0000.sql"), "select 1;");
    writeFileSync(join(source, "migrations", "meta", "journal.json"), "{}");
    copyRuntimeDirectory(join(source, "migrations"), join(output, "migrations"));
    expect(readFileSync(join(output, "binding.node"), "utf8")).toBe("native fixture bytes");
    expect(readFileSync(join(output, "migrations", "0000.sql"), "utf8")).toBe("select 1;");
    if (process.platform !== "win32") {
      expect(statSync(join(output, "binding.node")).mode & 0o777).toBe(0o644);
      expect(statSync(join(output, "migrations")).mode & 0o777).toBe(0o755);
      expect(statSync(join(output, "migrations", "meta")).mode & 0o777).toBe(0o755);
      expect(statSync(join(output, "migrations", "0000.sql")).mode & 0o777).toBe(0o644);
      expect(statSync(join(output, "migrations", "meta", "journal.json")).mode & 0o777).toBe(0o644);
    }
  } finally {
    process.umask(previousUmask);
    rmSync(root, { recursive: true, force: true });
  }
});

test("sealed pipeline bundle preserves collection exports without starting product or SQL on import", async () => {
  const { buildSourcePipelineAsset } = await import("./bot-runtime-assets");
  const root = mkdtempSync(join(tmpdir(), "shenron-pipeline-asset-"));
  try {
    const output = join(root, "dist");
    mkdirSync(output);
    const entry = join(import.meta.dir, "../ops/bun-source-pipeline.ts");
    const receipt = await buildSourcePipelineAsset(entry, output, "a".repeat(40));
    const hash = (bytes: string | Uint8Array) =>
      new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    expect(receipt.sourceEntrySha256).toBe(hash(await Bun.file(entry).bytes()));
    expect(receipt.sha256).toBe(hash(await Bun.file(join(output, "pipeline.mjs")).bytes()));
    expect(receipt.bytes).toBe(Bun.file(join(output, "pipeline.mjs")).size);
    expect(await Bun.file(join(output, "pipeline-build-receipt.json")).json()).toEqual(receipt);
    const owner = await import(join(output, "pipeline.mjs"));
    expect(typeof owner.collectSourcePipeline).toBe("function");
    expect(typeof owner.autoSourcePipeline).toBe("function");
    const input = join(root, "export.jsonl"),
      policy = join(root, "policy.json"),
      config = join(root, "config.json"),
      job = join(root, "job");
    await Bun.write(
      input,
      JSON.stringify({
        crawl_id: "asset-fixture",
        document_uid: hash("fixture"),
        canonical_url: "https://source.example/a",
        source_domain: "source.example",
        category: "reference",
        http_status: 200,
        raw_checksum: hash("fixture body"),
        timestamp_utc: "2026-10-15T00:00:00Z",
        payload: { title_raw: "Fixture", body_markdown: "fixture body", embedded_media: [] },
      }) + "\n",
    );
    await Bun.write(
      policy,
      JSON.stringify({
        version: 1,
        profile: "dbfr",
        sources: [
          {
            domain: "source.example",
            kind: "reference",
            reviewed: true,
            evidence: "https://source.example/",
            rights: { ragPermitted: false, trainingPermitted: false, publicImagesPermitted: false },
          },
        ],
      }),
    );
    await Bun.write(
      config,
      JSON.stringify({ version: 1, input, policy, job, collectionIsolation: "required" }),
    );
    await expect(owner.autoSourcePipeline(config)).rejects.toThrow("controller required");
    expect(await Bun.file(join(job, "checkpoint.sqlite")).exists()).toBe(false);
    const collected = await owner.collectSourcePipeline(config, { isolatedCollection: true });
    expect(collected.schema).toBe("shenron-source-collection/v1");
    expect(collected.configSha256).toBe(hash(await Bun.file(config).bytes()));
    const collectionPath = join(collected.pinnedConfigPath, "..", "collect.json");
    expect(collected.collectionSha256).toBe(hash(await Bun.file(collectionPath).bytes()));
    expect(await Bun.file(collectionPath).json()).toMatchObject({
      complete: true,
      documents: 1,
      canonicalPromotions: 0,
    });
    if (process.platform !== "win32")
      expect(statSync(join(output, "pipeline.mjs")).mode & 0o777).toBe(0o644);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
