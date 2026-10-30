#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/** Private derived VFS for notes reviewed by the bridge; uses Shenron's existing RAG writer. */
import { Database } from "bun:sqlite";
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createRagWriter } from "@aphrody/shenron-db/vfs/build";
import { openShenronVfs, type OpenedVfs } from "@aphrody/shenron-db/vfs";
import { ownedDirectory, resolveNotesHome, sha256 } from "./agent-home-notes";
import { createAphrodyCompute, type AphrodyCompute } from "@aphrody/shenron-pipeline/ai/aphrody";
import {
  assertEmbeddingSpace,
  requireAiHttpToken,
  requireAiHttpUrl,
  SHENRON_E5,
  SHENRON_RAG_INDEX,
} from "@aphrody/shenron-pipeline/ai/config";
import { normalizeVector } from "@aphrody/shenron-db/vfs/rag";
import { prepareNativeNoteImport } from "./agent-home-native-note";
import type { ObservationNote } from "./agent-home-notes";

export function renderObservationProjection(note: ObservationNote): string {
  return `# ${note.title}\n\nContinuité : ${note.continuity}\n\n${note.observations}\n\n## Limites\n\n${note.limitations}\n`;
}

export interface PrivateVectorOptions {
  compute: Pick<AphrodyCompute, "embed">;
  projection?: {
    version: 1;
    kind: "observations-markdown-v1";
    manifestPath: string;
    sha256: string;
    archives: number;
  };
  /** Failure of this private qualification preserves the previous index. */
  beforePublish?: (opened: OpenedVfs) => Promise<void>;
  expected: {
    noteId: string;
    sourceSha256: string;
    manifestSha256: string;
    indexSha256: string;
    chunks: number;
    chunkSha256?: readonly string[];
  };
}

export function privateQueryEmbedder(compute: Pick<AphrodyCompute, "embed">) {
  return async (query: string): Promise<Float32Array> => {
    const result = await compute.embed({
      texts: [query],
      kind: "query",
      requireModel: SHENRON_E5.modelId,
    });
    if (!result.ok) throw new Error(`Private query embedding failed: ${result.kind}`);
    return checkedPrivateVectors(result.value, 1)[0]!;
  };
}

function checkedPrivateVectors(
  result: { vectors: number[][]; model?: string },
  count: number,
): Float32Array[] {
  if (result.model !== SHENRON_E5.modelId || result.vectors.length !== count)
    throw new Error("Private embedding model or vector count differs");
  assertEmbeddingSpace(
    { model: result.model, dimensions: SHENRON_E5.dimensions },
    SHENRON_RAG_INDEX,
  );
  return result.vectors.map((vector) => {
    if (vector.length !== SHENRON_E5.dimensions || vector.some((value) => !Number.isFinite(value)))
      throw new Error("Private embedding is not finite and 384-dimensional");
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (Math.abs(norm - 1) > 0.001) throw new Error("Private embedding is not L2-normalized");
    return normalizeVector(Float32Array.from(vector));
  });
}

/** Native Aphrody core, same shenron_parity owner as shenronRagChunk; no handwritten chunker. */
export async function chunkReviewedMarkdown(text: string): Promise<{ text: string }[]> {
  const child = Bun.spawn(
    [
      "aphrody",
      "pure",
      "rag",
      "chunk",
      "-",
      "--path",
      "note.md",
      "--profile",
      "shenron_parity",
      "--max-chars",
      "1400",
      "--min-chars",
      "1",
      "--overlap-pct",
      "0.15",
    ],
    { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
  );
  child.stdin.write(text);
  child.stdin.end();
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code)
    throw new Error(`Native Aphrody chunker failed (${code}; stderr bytes ${stderr.length})`);
  let chunks: unknown;
  try {
    chunks = JSON.parse(stdout);
  } catch {
    throw new Error("Native Aphrody chunker returned invalid JSON; private output suppressed");
  }
  if (
    !Array.isArray(chunks) ||
    chunks.length === 0 ||
    chunks.some((chunk) => typeof chunk.text !== "string" || !chunk.text.trim())
  )
    throw new Error("Native Aphrody chunker returned invalid chunks");
  return chunks;
}

/** Shared validated review registry: navigation and retrieval use the same current-note gate. */
export async function readReviewedPrivateNotes(home: string) {
  const reviews = join(home, "notes", "reviews");
  const docs: {
    id: string;
    title: string;
    text: string;
    reviewedAt: string;
    sourceSha256: string;
    manifestSha256: string;
  }[] = [];
  ownedDirectory(home, reviews);
  if (!existsSync(reviews)) return docs;
  for await (const filename of new Bun.Glob("*.json").scan({
    cwd: reviews,
    onlyFiles: true,
    throwErrorOnBrokenSymlink: true,
  })) {
    if (filename.endsWith(".manifest.json")) continue;
    const reviewPath = join(reviews, filename);
    ownedDirectory(home, reviewPath);
    const review = await Bun.file(reviewPath).json();
    if (
      review.version !== 1 ||
      !/^[a-z][a-z0-9-]{1,79}$/.test(review.id) ||
      filename !== review.id + ".json" ||
      typeof review.title !== "string" ||
      !/^[a-f0-9]{64}$/.test(review.markdownSha256) ||
      !/^[a-f0-9]{64}$/.test(review.manifestSha256) ||
      !Number.isFinite(Date.parse(review.reviewedAt))
    ) {
      throw new Error("Invalid curated note review record");
    }
    const path = join(home, "memory", review.id + ".md");
    ownedDirectory(home, path);
    const text = await Bun.file(path).text();
    if (sha256(text) !== review.markdownSha256)
      throw new Error("Curated note changed; review and import it again before indexing");
    docs.push({
      id: review.id,
      title: review.title,
      text,
      reviewedAt: review.reviewedAt,
      sourceSha256: review.markdownSha256,
      manifestSha256: review.manifestSha256,
    });
  }
  return docs.toSorted((a, b) => a.id.localeCompare(b.id));
}

export async function indexPrivateNotes(
  home: string,
  apply = false,
  chunker = chunkReviewedMarkdown,
  vectors?: PrivateVectorOptions,
) {
  const docs = await readReviewedPrivateNotes(home);
  if (docs.length === 0) throw new Error("No reviewed notes available; no index was created");
  const baselineOutput = join(home, "notes", "private-notes-vfs.sqlite");
  const projection = vectors?.projection;
  let projectedText: string | undefined;
  const validateProjection = async () => {
    if (!projection || !vectors) return;
    if (
      projection.version !== 1 ||
      projection.kind !== "observations-markdown-v1" ||
      !/^[a-f0-9]{64}$/.test(projection.sha256) ||
      !Number.isSafeInteger(projection.archives) ||
      projection.archives < 1
    )
      throw new Error("Invalid private projection contract");
    const reviewed = await prepareNativeNoteImport({
      home,
      manifestPath: projection.manifestPath,
      expectedSourceSha256: vectors.expected.sourceSha256,
      expectedManifestSha256: vectors.expected.manifestSha256,
    });
    if (
      reviewed.noteId !== vectors.expected.noteId ||
      reviewed.attachments.length !== projection.archives
    )
      throw new Error("Private projection archive scope differs");
    const manifestText = await Bun.file(projection.manifestPath).text();
    if (sha256(manifestText) !== vectors.expected.manifestSha256)
      throw new Error("Projection manifest changed during validation");
    const note = JSON.parse(manifestText) as ObservationNote;
    const text = renderObservationProjection(note);
    if (sha256(text) !== projection.sha256) throw new Error("Private projection SHA differs");
    projectedText = text;
  };
  await validateProjection();
  const output = projection
    ? join(
        home,
        "notes",
        "experiments",
        `private-notes-vfs-observations-v1-${projection.sha256}.sqlite`,
      )
    : baselineOutput;
  if (projection && existsSync(output))
    throw new Error("Private experimental candidate already exists");
  let vectorCount = 0;
  let backup: string | null = null;
  if (vectors) {
    const expected = vectors.expected;
    if (
      docs.length !== 1 ||
      docs[0]!.id !== expected.noteId ||
      docs[0]!.sourceSha256 !== expected.sourceSha256 ||
      docs[0]!.manifestSha256 !== expected.manifestSha256 ||
      !Number.isSafeInteger(expected.chunks) ||
      expected.chunks < 1 ||
      expected.chunks > 16 ||
      !/^[a-f0-9]{64}$/.test(expected.indexSha256)
    )
      throw new Error("Private vector job differs from the reviewed one-note snapshot");
    if (
      !(await Bun.file(baselineOutput).exists()) ||
      sha256(await Bun.file(baselineOutput).arrayBuffer()) !== expected.indexSha256
    )
      throw new Error("Previous private lexical index SHA differs");
  }
  ownedDirectory(home, output);
  if (await Bun.file(output).exists()) {
    const previous = openShenronVfs(output, { readOnly: true });
    try {
      if (previous.vfs.meta("notes_bridge_version") !== "1")
        throw new Error("Refuse to replace an unrelated VFS");
    } finally {
      previous.vfs.db.close();
    }
  }
  if (apply) {
    if (vectors) {
      backup = join(home, "notes", "backups", vectors.expected.indexSha256 + ".sqlite");
      ownedDirectory(home, backup);
      mkdirSync(join(home, "notes", "backups"), { recursive: true, mode: 0o700 });
      if (!(await Bun.file(backup).exists())) {
        const descriptor = openSync(backup, "wx", 0o600);
        closeSync(descriptor);
        await Bun.write(backup, Bun.file(baselineOutput));
      }
      if (sha256(await Bun.file(backup).arrayBuffer()) !== vectors.expected.indexSha256)
        throw new Error("Private lexical backup SHA differs");
      chmodSync(backup, 0o600);
    }
    const temp = output + `.${process.pid}.tmp`;
    if (await Bun.file(temp).exists()) throw new Error("Index temporary file already exists");
    mkdirSync(join(home, "notes"), { recursive: true, mode: 0o700 });
    if (projection) mkdirSync(join(home, "notes", "experiments"), { recursive: true, mode: 0o700 });
    const temporaryDb = new Database(temp);
    try {
      // Protect the file before the VFS writer can put any private note bytes into it.
      chmodSync(temp, 0o600);
    } catch (error) {
      temporaryDb.close();
      rmSync(temp, { force: true });
      throw error;
    }
    const opened = openShenronVfs(temporaryDb, { readOnly: false });
    try {
      opened.vfs.setMeta("profile", "complet");
      opened.vfs.setMeta("generated_at", new Date().toISOString());
      opened.vfs.setMeta("notes_bridge_version", "1");
      if (projection) {
        opened.vfs.setMeta("notes_projection", projection.kind);
        opened.vfs.setMeta("notes_projection_sha256", projection.sha256);
        opened.vfs.setMeta("notes_source_sha256", vectors!.expected.sourceSha256);
        opened.vfs.setMeta("notes_manifest_sha256", vectors!.expected.manifestSha256);
      }
      opened.vfs.mkdirAll("/home/memory");
      for (const doc of docs)
        opened.vfs.write(`/home/memory/${doc.id}.md`, doc.text, {
          visibility: "private",
          mime: "text/markdown",
        });
      // Chunk before entering the writer transaction; failure never replaces the active derived file.
      const chunks: { doc: (typeof docs)[number]; chunks: { text: string }[] }[] = [];
      for (const doc of docs)
        chunks.push({ doc, chunks: await chunker(projectedText ?? doc.text) });
      const texts = chunks.flatMap((entry) => entry.chunks.map((chunk) => chunk.text));
      let embeddings: Float32Array[] = [];
      if (vectors) {
        if (texts.length !== vectors.expected.chunks)
          throw new Error("Private chunk count differs before embedding request");
        // The native Markdown chunker treats some lists as a single soft-limit block.
        // Reject oversized input rather than truncating reviewed evidence silently.
        if (texts.some((text) => text.length > 1400))
          throw new Error("Private chunk exceeds the effective 1400-character embedding bound");
        if (
          vectors.expected.chunkSha256 &&
          JSON.stringify(texts.map((text) => sha256(text.trim()))) !==
            JSON.stringify(vectors.expected.chunkSha256)
        )
          throw new Error("Private chunk content differs before embedding request");
        const result = await vectors.compute.embed({
          texts,
          kind: "passage",
          requireModel: SHENRON_E5.modelId,
        });
        if (!result.ok) throw new Error(`Private passage embedding failed: ${result.kind}`);
        embeddings = checkedPrivateVectors(result.value, texts.length);
        vectorCount = embeddings.length;
      }
      const writer = createRagWriter(opened.vfs.db, vectors ? "f32" : "none");
      let position = 0;
      for (const { doc, chunks: items } of chunks)
        for (const [index, item] of items.entries())
          writer.add(
            {
              corpus: "home",
              entity_id: `shenron:home:memory/${doc.id}.md:${index}`,
              title: doc.title,
              url: null,
              content: item.text,
              metadata: { kind: "home", lang: "fr", originSourceId: "agent_home" },
              updated_at: doc.reviewedAt,
              embedding: vectors ? embeddings[position++]! : null,
              model: vectors ? SHENRON_E5.modelId : null,
            },
            "private",
          );
      writer.finish();
      if (opened.rag.stats().docs !== docs.length)
        throw new Error("Derived index does not match reviewed notes");
      if (vectors && opened.rag.stats().vectorsF32 !== vectors.expected.chunks)
        throw new Error("Private vector index is incomplete");
      if (vectors?.beforePublish) await vectors.beforePublish(opened);
      opened.vfs.db.close();
      if (vectors) {
        const current = await readReviewedPrivateNotes(home);
        if (
          current.length !== 1 ||
          current[0]!.sourceSha256 !== vectors.expected.sourceSha256 ||
          current[0]!.manifestSha256 !== vectors.expected.manifestSha256
        )
          throw new Error("Reviewed note changed; private publication refused");
      }
      await validateProjection();
      if (
        vectors &&
        sha256(await Bun.file(baselineOutput).arrayBuffer()) !== vectors.expected.indexSha256
      )
        throw new Error("Previous index changed; private publication refused");
      if (projection && existsSync(output))
        throw new Error("Private candidate changed; publication refused");
      renameSync(temp, output);
    } catch (error) {
      opened.vfs.db.close();
      rmSync(temp, { force: true });
      throw error;
    }
  }
  return {
    mode: apply ? "indexed" : "preview",
    notes: docs.length,
    vectors: vectorCount,
    model: vectorCount ? SHENRON_E5.modelId : null,
    backup,
    visibility: "private",
    output,
    consumerEnv: { SHENRON_VFS_DB: output },
  };
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const at = args.indexOf("--home");
  const home = resolveNotesHome(at >= 0 ? args[at + 1] : undefined);
  const value = (flag: string) => {
    const index = args.indexOf(flag);
    if (index < 0 || !args[index + 1]) throw new Error(`Missing ${flag}`);
    return args[index + 1]!;
  };
  let vectors: PrivateVectorOptions | undefined;
  if (args.includes("--embedding")) {
    if (value("--embedding") !== "aphrody")
      throw new Error("Only the existing Aphrody embedding client is supported");
    vectors = {
      compute: createAphrodyCompute({
        baseUrl: requireAiHttpUrl(process.env),
        token: requireAiHttpToken(process.env),
      }),
      expected: {
        noteId: value("--expected-note"),
        sourceSha256: value("--expected-source-sha"),
        manifestSha256: value("--expected-manifest-sha"),
        indexSha256: value("--expected-index-sha"),
        chunks: Number(value("--expected-chunks")),
      },
    };
  }
  console.log(
    JSON.stringify(
      await indexPrivateNotes(home, args.includes("--apply"), chunkReviewedMarkdown, vectors),
      null,
      2,
    ),
  );
}
