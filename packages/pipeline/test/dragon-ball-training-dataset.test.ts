// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApprovedTrainingDatasetPort } from "../src/dragon-ball/training-dataset";
import { digest, verifyDataset, type DatasetManifest } from "../src/dragon-ball/source-coverage";
import type { AutomationContext } from "../src/dragon-ball/automation";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "shenron-approved-training-"));
  roots.push(root);
  await mkdir(join(root, "assets"), { mode: 0o700 });
  await writeFile(join(root, "assets/source.bin"), "source asset", { mode: 0o600 });
  const manifest: DatasetManifest = {
    version: 1,
    family: "guides",
    id: "guides_1",
    title: "Fixture source",
    citation: "https://www.shueisha.co.jp/",
    edition: {
      publisher: "Fixture publisher",
      format: "digital",
      language: "ja",
      identifier: "fixture",
    },
    unit: "document",
    asOf: new Date().toISOString().slice(0, 10),
    enumerationEvidence: "https://www.shueisha.co.jp/",
    enumerationReviewed: true,
    expectedIds: ["one"],
    editorialTarget: "none",
    rights: {
      basis: "permission",
      evidence: "PRIVATE RIGHTS",
      ragPermitted: true,
      trainingPermitted: true,
      publicImagesPermitted: false,
    },
    trainingReview: "approved",
    items: [
      {
        id: "one",
        asset: "source.bin",
        sha256: digest("source asset"),
        review: "approved",
        text: "PRIVATE SOURCE",
        noText: false,
        lang: "ja",
      },
    ],
  };
  const source = await verifyDataset(manifest, join(root, "assets"));
  const context: AutomationContext = {
    key: "fixture-key",
    sourceId: "guides/guides_1",
    inputDigest: source.digest,
    stage: "dataset-prepare",
  };
  const row = (prompt: string, answer: string) => ({
    messages: [
      { role: "system", content: "Shared system instructions" },
      { role: "user", content: prompt },
      { role: "assistant", content: answer },
    ],
    metadata: { sourceDigest: source.digest, labelReview: "approved" },
  });
  const train = row("Training question about manga source", "Verified training response");
  const gold = row("Heldout question about timeline", "Reviewed heldout response");
  const entry = {
    family: "guides",
    id: "guides_1",
    sourceDigest: source.digest,
    asOf: manifest.asOf,
    review: "approved",
    target: {
      owner: "aphrody-train",
      recipe: "aphrody_train.bun_finetune:train",
      runtime: "python-cuda",
      format: "supervised-chat-jsonl",
      domain: "dragon-ball",
      review: "approved",
      compatible: true,
    },
    splits: {
      train: { path: "train.jsonl", sha256: "" },
      eval: { path: "eval.jsonl", sha256: "" },
    },
  };
  const catalog = { version: 1, datasets: [entry] };
  const manifestPath = join(root, "approved.json");
  const save = async (training: unknown[] = [train], heldout: unknown[] = [gold]) => {
    const trainBytes = `${training.map((value) => JSON.stringify(value)).join("\n")}\n`;
    const evalBytes = `${heldout.map((value) => JSON.stringify(value)).join("\n")}\n`;
    await writeFile(join(root, "train.jsonl"), trainBytes, { mode: 0o600 });
    await writeFile(join(root, "eval.jsonl"), evalBytes, { mode: 0o600 });
    entry.splits.train.sha256 = digest(trainBytes);
    entry.splits.eval.sha256 = digest(evalBytes);
    await writeFile(manifestPath, JSON.stringify(catalog), { mode: 0o600 });
  };
  await save();
  return {
    root,
    source,
    context,
    entry,
    catalog,
    train,
    gold,
    save,
    row,
    port: createApprovedTrainingDatasetPort({ root, manifestPath }),
  };
}

test("approved supervised splits produce hashes only and do not assert runtime availability", async () => {
  const f = await fixture();
  const report = await f.port(f.source, f.context);
  expect(report).toEqual({
    state: "completed",
    value: {
      sourceDigest: f.source.digest,
      datasetDigest: f.entry.splits.train.sha256,
      goldDigest: f.entry.splits.eval.sha256,
      approved: true,
      compatible: true,
      goldDisjoint: true,
    },
  });
  const metadata = JSON.stringify(report);
  expect(metadata).not.toContain(f.root);
  expect(metadata).not.toContain("Training question");
  expect(metadata).not.toContain("PRIVATE RIGHTS");
  expect(metadata).not.toContain("runtime");
});

test("missing files, modified bytes and escaping symlinks never qualify", async () => {
  const f = await fixture();
  await rm(join(f.root, "eval.jsonl"));
  expect(await f.port(f.source, f.context)).toEqual({
    state: "blocked",
    code: "training-dataset-files-unavailable",
  });
  await f.save();
  await writeFile(join(f.root, "train.jsonl"), "modified content");
  expect(await f.port(f.source, f.context)).toEqual({
    state: "blocked",
    code: "training-dataset-checksum-mismatch",
  });
  await rm(join(f.root, "train.jsonl"));
  await symlink("/etc/passwd", join(f.root, "train.jsonl"));
  expect(await f.port(f.source, f.context)).toEqual({
    state: "blocked",
    code: "training-dataset-path-outside-root",
  });
});

test("NFKC case whitespace overlap and normalized duplicate pairs are rejected", async () => {
  const f = await fixture();
  const gold = f.row(
    "Ｔｒａｉｎｉｎｇ　ＱＵＥＳＴＩＯＮ  ＡＢＯＵＴ ＭＡＮＧＡ ＳＯＵＲＣＥ",
    "Distinct heldout answer",
  );
  await f.save([f.train], [gold]);
  expect(await f.port(f.source, f.context)).toEqual({
    state: "blocked",
    code: "training-dataset-gold-overlap",
  });
  await f.save([
    f.train,
    f.row("  TRAINING question\t about manga SOURCE ", "VERIFIED   training response"),
  ]);
  expect(await f.port(f.source, f.context)).toEqual({
    state: "blocked",
    code: "training-dataset-duplicate-rows",
  });
  await f.save([f.train], [f.row("Distinct evaluation prompt", "VERIFIED TRAINING RESPONSE")]);
  expect(await f.port(f.source, f.context)).toEqual({
    state: "blocked",
    code: "training-dataset-gold-overlap",
  });
});

test("embedded heldout sentences also trigger the owner hash anti-join", async () => {
  const f = await fixture();
  await f.save([
    f.row(
      "Unique training question",
      "Context before. Heldout question about timeline. Context after.",
    ),
  ]);
  expect(await f.port(f.source, f.context)).toEqual({
    state: "blocked",
    code: "training-dataset-gold-overlap",
  });
});

test("unapproved row labels and stale source lineage are refused", async () => {
  const f = await fixture();
  f.train.metadata.labelReview = "pending";
  await f.save();
  expect(await f.port(f.source, f.context)).toEqual({
    state: "blocked",
    code: "training-dataset-row-unapproved",
  });
  f.train.metadata.labelReview = "approved";
  f.train.metadata.sourceDigest = digest("another source");
  await f.save();
  expect(await f.port(f.source, f.context)).toEqual({
    state: "blocked",
    code: "training-dataset-stale-lineage",
  });
  f.source.manifest.rights.trainingPermitted = false;
  expect(await f.port(f.source, f.context)).toEqual({
    state: "blocked",
    code: "training-dataset-source-unapproved",
  });
});

test("a selected incompatible recipe or malformed chat never receives approval", async () => {
  const f = await fixture();
  f.entry.target.recipe = "arbitrary teacher";
  await f.save();
  expect(await f.port(f.source, f.context)).toEqual({
    state: "blocked",
    code: "training-dataset-recipe-unapproved",
  });
  f.entry.target.recipe = "aphrody_train.bun_finetune:train";
  f.entry.target.format = "raw-documents";
  await f.save();
  expect(await f.port(f.source, f.context)).toEqual({
    state: "blocked",
    code: "training-dataset-recipe-unapproved",
  });
  f.entry.target.format = "supervised-chat-jsonl";
  f.train.messages.at(-1)!.role = "user";
  await f.save();
  expect(await f.port(f.source, f.context)).toEqual({
    state: "blocked",
    code: "training-dataset-format-invalid",
  });
  await f.save([], [f.gold]);
  expect(await f.port(f.source, f.context)).toEqual({
    state: "blocked",
    code: "training-dataset-empty-split",
  });
});

test("duplicate approvals and nonprivate training stores remain blocked", async () => {
  const f = await fixture();
  f.catalog.datasets.push(f.entry);
  await f.save();
  expect(await f.port(f.source, f.context)).toEqual({
    state: "blocked",
    code: "training-dataset-lineage-unavailable",
  });
  if (process.platform !== "win32") {
    await chmod(f.root, 0o755);
    expect(await f.port(f.source, f.context)).toEqual({
      state: "blocked",
      code: "training-dataset-root-unprotected",
    });
  }
});
