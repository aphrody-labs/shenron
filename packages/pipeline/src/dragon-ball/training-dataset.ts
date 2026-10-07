// SPDX-License-Identifier: Apache-2.0
/** Approve existing protected supervised splits; never synthesize labels or execute training. */
import { readFile, realpath, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";
import type { DragonBallAutomationPorts } from "./automation";
import { normalizeText, segmentHashes } from "../ai/training-hashes";
import { datasetManifestSchema, digest, DRAGON_BALL_DATASET_FAMILIES } from "./source-coverage";

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const identifier = z.string().regex(/^[a-z0-9_]{1,64}$/);
const split = z.object({ path: z.string().min(1), sha256 });
export const approvedTrainingDatasetCatalogSchema = z.object({
  version: z.literal(1),
  datasets: z
    .array(
      z.object({
        family: z.enum(DRAGON_BALL_DATASET_FAMILIES),
        id: identifier,
        sourceDigest: sha256,
        asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        review: z.enum(["approved", "pending", "rejected"]),
        target: z.object({
          owner: z.string(),
          recipe: z.string(),
          runtime: z.string(),
          format: z.string(),
          domain: z.string(),
          review: z.enum(["approved", "pending", "rejected"]),
          compatible: z.boolean(),
        }),
        // SHA fields retain the existing aphrody_train.bun_finetune manifest contract.
        splits: z.object({ train: split, eval: split }),
      }),
    )
    .max(10000),
});
const rowApproval = z.object({ sourceDigest: sha256, labelReview: z.literal("approved") });
const supervisedRow = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string().trim().min(1),
      }),
    )
    .min(2)
    .max(128),
  metadata: rowApproval,
});
interface ProtectedFile {
  bytes: Buffer;
}
class DatasetRejected extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
function reject(code: string): never {
  throw new DatasetRejected(code);
}

async function protectedRoot(path: string): Promise<string> {
  const root = await realpath(path);
  const info = await stat(root);
  if (!info.isDirectory() || (process.platform !== "win32" && (info.mode & 0o077) !== 0))
    reject("training-dataset-root-unprotected");
  return root;
}
async function readProtectedFile(
  root: string,
  path: string,
  maxBytes: number,
): Promise<ProtectedFile> {
  const resolved = await realpath(resolve(root, path));
  const local = relative(root, resolved);
  if (local === ".." || local.startsWith("../") || local.startsWith("..\\") || isAbsolute(local))
    reject("training-dataset-path-outside-root");
  const info = await stat(resolved);
  if (
    !info.isFile() ||
    info.size > maxBytes ||
    (process.platform !== "win32" && (info.mode & 0o077) !== 0)
  )
    reject("training-dataset-file-unprotected");
  const bytes = await readFile(resolved);
  if (bytes.byteLength > maxBytes) reject("training-dataset-file-too-large");
  return { bytes };
}

/** NFKC is a conservative addition to the owner's NFC/case/whitespace hash anti-join.
 * It catches compatibility spellings, not all Unicode visual confusables. */
function normalized(value: string): string {
  return normalizeText(value, true, { compatibility: true });
}
function textKeys(text: string): Set<string> {
  const keys = segmentHashes(text, { compatibility: true });
  // Mirror the owner's conservative URL/path anti-join without exposing URLs.
  for (const match of text.matchAll(/https?:\/\/[^\s<>"'`)\]}]+/giu)) {
    const raw = normalized(match[0])
      .replace(/[.,;:!?]+$/u, "")
      .split("#")[0]!
      .replace(/\/+$/u, "");
    keys.add(digest(raw));
    try {
      const url = new URL(raw);
      const path = `${url.pathname}${url.search}`.replace(/\/+$/u, "");
      if (path.length > 1) keys.add(digest(`path:${path}`));
    } catch {
      reject("training-dataset-format-invalid");
    }
  }
  return keys;
}
interface RowEvidence {
  identity: string;
  keys: Set<string>;
}
function splitRows(bytes: Buffer, sourceDigest: string): RowEvidence[] {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return reject("training-dataset-format-invalid");
  }
  const rows: RowEvidence[] = [];
  const identities = new Set<string>();
  for (const line of text.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    if (Buffer.byteLength(line) > 1024 * 1024 || rows.length >= 50000)
      reject("training-dataset-file-too-large");
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      reject("training-dataset-format-invalid");
    }
    if (
      typeof raw !== "object" ||
      raw === null ||
      !("metadata" in raw) ||
      !rowApproval.safeParse(raw.metadata).success
    )
      reject("training-dataset-row-unapproved");
    const parsed = supervisedRow.safeParse(raw);
    if (!parsed.success) reject("training-dataset-format-invalid");
    const row = parsed.data;
    if (row.metadata.sourceDigest !== sourceDigest) reject("training-dataset-stale-lineage");
    const messages = row.messages;
    if (
      messages.at(-1)!.role !== "assistant" ||
      !messages.some((message) => message.role === "user")
    )
      reject("training-dataset-format-invalid");
    let next: "user" | "assistant" = "user";
    for (const [index, message] of messages.entries()) {
      if (index === 0 && message.role === "system") continue;
      if (message.role !== next || /[\ud800-\udfff]/u.test(message.content))
        reject("training-dataset-format-invalid");
      next = next === "user" ? "assistant" : "user";
    }
    const prompt = messages
      .slice(0, -1)
      .filter((message) => message.role !== "system")
      .map((message) => message.content)
      .join("\n");
    const answer = messages.at(-1)!.content;
    const identity = digest(JSON.stringify([normalized(prompt), normalized(answer)]));
    if (identities.has(identity)) reject("training-dataset-duplicate-rows");
    identities.add(identity);
    const keys = new Set([...textKeys(prompt), ...textKeys(answer)]);
    for (const message of messages.filter((item) => item.role !== "system"))
      for (const key of textKeys(message.content)) keys.add(key);
    rows.push({ identity, keys });
  }
  if (!rows.length) reject("training-dataset-empty-split");
  return rows;
}

/** A supplied catalog is reviewed evidence, never a declaration that the training runtime is ready. */
export function createApprovedTrainingDatasetPort(options: {
  manifestPath: string;
  root: string;
}): NonNullable<DragonBallAutomationPorts["prepareDataset"]> {
  return async (source, context) => {
    try {
      context.signal?.throwIfAborted();
      const current = datasetManifestSchema.safeParse(source.manifest);
      const asOf = new Date().toISOString().slice(0, 10);
      if (
        !current.success ||
        source.gaps.length ||
        source.digest !== digest(JSON.stringify(current.data)) ||
        current.data.asOf !== asOf ||
        !current.data.enumerationReviewed ||
        current.data.trainingReview !== "approved" ||
        current.data.rights.basis === "unverified" ||
        !current.data.rights.trainingPermitted ||
        !current.data.rights.ragPermitted ||
        current.data.items.some((item) => item.review !== "approved")
      )
        reject("training-dataset-source-unapproved");
      if (
        context.stage !== "dataset-prepare" ||
        context.inputDigest !== source.digest ||
        context.sourceId !== `${source.manifest.family}/${source.manifest.id}`
      )
        reject("training-dataset-stale-lineage");
      const root = await protectedRoot(options.root);
      let raw: unknown;
      try {
        const catalog = await readProtectedFile(root, options.manifestPath, 16 * 1024 * 1024);
        raw = JSON.parse(catalog.bytes.toString("utf8"));
      } catch (error) {
        if (error instanceof DatasetRejected) throw error;
        reject("training-dataset-manifest-unavailable");
      }
      const catalog = approvedTrainingDatasetCatalogSchema.safeParse(raw);
      if (!catalog.success) reject("training-dataset-manifest-invalid");
      const matching = catalog.data.datasets.filter(
        (entry) =>
          entry.family === source.manifest.family &&
          entry.id === source.manifest.id &&
          entry.sourceDigest === source.digest,
      );
      if (matching.length !== 1) reject("training-dataset-lineage-unavailable");
      const entry = matching[0]!;
      if (entry.asOf !== asOf || entry.review !== "approved")
        reject("training-dataset-source-unapproved");
      if (
        entry.target.owner !== "aphrody-train" ||
        entry.target.recipe !== "aphrody_train.bun_finetune:train" ||
        entry.target.runtime !== "python-cuda" ||
        entry.target.format !== "supervised-chat-jsonl" ||
        entry.target.domain !== "dragon-ball" ||
        entry.target.review !== "approved" ||
        !entry.target.compatible
      )
        reject("training-dataset-recipe-unapproved");
      if (isAbsolute(entry.splits.train.path) || isAbsolute(entry.splits.eval.path))
        reject("training-dataset-path-outside-root");
      if (
        basename(entry.splits.train.path) !== "train.jsonl" ||
        basename(entry.splits.eval.path) !== "eval.jsonl" ||
        dirname(resolve(root, entry.splits.train.path)) !==
          dirname(resolve(root, entry.splits.eval.path))
      )
        reject("training-dataset-recipe-unapproved");
      let train: ProtectedFile;
      let gold: ProtectedFile;
      try {
        train = await readProtectedFile(root, entry.splits.train.path, 64 * 1024 * 1024);
        gold = await readProtectedFile(root, entry.splits.eval.path, 64 * 1024 * 1024);
      } catch (error) {
        if (error instanceof DatasetRejected) throw error;
        reject("training-dataset-files-unavailable");
      }
      const datasetDigest = digest(train.bytes);
      const goldDigest = digest(gold.bytes);
      if (datasetDigest !== entry.splits.train.sha256 || goldDigest !== entry.splits.eval.sha256)
        reject("training-dataset-checksum-mismatch");
      const trainRows = splitRows(train.bytes, source.digest);
      const goldRows = splitRows(gold.bytes, source.digest);
      const heldoutKeys = new Set<string>();
      for (const row of goldRows) for (const key of row.keys) heldoutKeys.add(key);
      if (trainRows.some((row) => [...row.keys].some((key) => heldoutKeys.has(key))))
        reject("training-dataset-gold-overlap");
      context.signal?.throwIfAborted();
      return {
        state: "completed",
        value: {
          sourceDigest: source.digest,
          datasetDigest,
          goldDigest,
          approved: true,
          compatible: true,
          goldDisjoint: true,
        },
      };
    } catch (error) {
      return {
        state: "blocked",
        code: context.signal?.aborted
          ? "training-dataset-cancelled"
          : error instanceof DatasetRejected
            ? error.code
            : "training-dataset-files-unavailable",
      };
    }
  };
}
