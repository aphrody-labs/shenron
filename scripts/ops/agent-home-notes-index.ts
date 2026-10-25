#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/** Private derived VFS for notes reviewed by the bridge; uses Shenron's existing RAG writer. */
import { Database } from "bun:sqlite";
import { mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createRagWriter } from "../../packages/db/src/vfs/build";
import { openShenronVfs } from "../../packages/db/src/vfs";
import { ownedDirectory, resolveNotesHome, sha256 } from "./agent-home-notes";

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
  const chunks = JSON.parse(stdout);
  if (
    !Array.isArray(chunks) ||
    chunks.length === 0 ||
    chunks.some((chunk) => typeof chunk.text !== "string" || !chunk.text.trim())
  )
    throw new Error("Native Aphrody chunker returned invalid chunks");
  return chunks;
}

export async function indexPrivateNotes(
  home: string,
  apply = false,
  chunker = chunkReviewedMarkdown,
) {
  const reviews = join(home, "notes", "reviews");
  const docs: { id: string; title: string; text: string; reviewedAt: string }[] = [];
  ownedDirectory(home, reviews);
  for await (const filename of new Bun.Glob("*.json").scan({
    cwd: reviews,
    onlyFiles: true,
    throwErrorOnBrokenSymlink: true,
  })) {
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
    docs.push({ id: review.id, title: review.title, text, reviewedAt: review.reviewedAt });
  }
  if (docs.length === 0) throw new Error("No reviewed notes available; no index was created");
  const output = join(home, "notes", "private-notes-vfs.sqlite");
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
    const temp = output + `.${process.pid}.tmp`;
    if (await Bun.file(temp).exists()) throw new Error("Index temporary file already exists");
    mkdirSync(join(home, "notes"), { recursive: true, mode: 0o700 });
    const opened = openShenronVfs(new Database(temp), { readOnly: false });
    try {
      opened.vfs.setMeta("profile", "complet");
      opened.vfs.setMeta("generated_at", new Date().toISOString());
      opened.vfs.setMeta("notes_bridge_version", "1");
      opened.vfs.mkdirAll("/home/memory");
      for (const doc of docs)
        opened.vfs.write(`/home/memory/${doc.id}.md`, doc.text, {
          visibility: "private",
          mime: "text/markdown",
        });
      // Chunk before entering the writer transaction; failure never replaces the active derived file.
      const chunks: { doc: (typeof docs)[number]; chunks: { text: string }[] }[] = [];
      for (const doc of docs) chunks.push({ doc, chunks: await chunker(doc.text) });
      const writer = createRagWriter(opened.vfs.db, "none");
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
              embedding: null,
              model: null,
            },
            "private",
          );
      writer.finish();
      if (opened.rag.stats().docs !== docs.length)
        throw new Error("Derived index does not match reviewed notes");
      opened.vfs.db.close();
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
    vectors: 0,
    visibility: "private",
    output,
    consumerEnv: { SHENRON_VFS_DB: output },
  };
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const at = args.indexOf("--home");
  const home = resolveNotesHome(at >= 0 ? args[at + 1] : undefined);
  console.log(JSON.stringify(await indexPrivateNotes(home, args.includes("--apply")), null, 2));
}
