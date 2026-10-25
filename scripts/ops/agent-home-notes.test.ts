// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { Database } from "bun:sqlite";
import { applyVfsSchema } from "../../packages/db/src/vfs/schema";
import { createRagWriter } from "../../packages/db/src/vfs/build";
import { VfsRag } from "../../packages/db/src/vfs/rag";
import { openShenronVfs } from "../../packages/db/src/vfs";
import { indexPrivateNotes } from "./agent-home-notes-index";
import {
  importNote,
  prepareNote,
  sha256,
  validateNote,
  type ObservationNote,
} from "./agent-home-notes";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    const absolute = resolve(root);
    if (
      !absolute.startsWith(resolve(tmpdir()) + sep) ||
      !/^shenron-(notes|outside)-/.test(basename(absolute))
    )
      throw new Error("Refuse cleanup outside the owned note fixtures");
    rmSync(absolute, { recursive: true, force: true });
  }
});
async function fixture(status: "draft" | "reviewed" = "reviewed") {
  const home = mkdtempSync(join(tmpdir(), "shenron-notes-"));
  roots.push(home);
  await Bun.write(join(home, "scan.txt"), "Authorized scan fixture");
  const note: ObservationNote = {
    version: 1,
    id: "manga-eye-shape",
    title: "Contour des yeux",
    status,
    visibility: "private",
    continuity: "Manga original",
    observedAt: "2026-10-25T12:00:00Z",
    observations: "Le contour extérieur se prolonge sur la case observée.",
    limitations: "Une seule case ; aucune règle générale déduite.",
    sources: [
      {
        file: "scan.txt",
        sha256: sha256("Authorized scan fixture"),
        locator: "Tome 1, planche 1, case 1",
      },
    ],
    ...(status === "reviewed" ? { review: { by: "editor", at: "2026-10-25T12:30:00Z" } } : {}),
  };
  return { home, note, prepared: await prepareNote(JSON.stringify(note), home) };
}

test("preview never writes a note; draft goes only to the excluded inbox", async () => {
  const { home, prepared } = await fixture("draft");
  const preview = await importNote(home, prepared);
  expect(preview.retrieval).toBe("excluded-draft");
  expect(preview.destinations).toHaveLength(1);
  expect(await Bun.file(preview.destinations[0]!).exists()).toBe(false);
  await importNote(home, prepared, { apply: true });
  expect(await Bun.file(preview.destinations[0]!).text()).toContain("status: draft");
  expect(await Bun.file(join(home, "memory", "manga-eye-shape.md")).exists()).toBe(false);
});

test("reviewed evidence reaches the real memory consumer used as the Obsidian vault", async () => {
  const { home, prepared } = await fixture();
  const receipt = await importNote(home, prepared, { apply: true });
  expect(receipt.indexed).toBe(false);
  const memory = await Bun.file(join(home, "memory", "manga-eye-shape.md")).text();
  expect(receipt.destinations).toEqual([
    join(home, "notes", "inbox", `manga-eye-shape-${prepared.digest}.md`),
    join(home, "memory", "manga-eye-shape.md"),
  ]);
  expect(memory).toContain(prepared.note.sources[0]!.sha256);
  expect(memory).toContain("continuity:");
  expect(memory).toContain("## Limites");
  expect(await importNote(home, prepared, { apply: true })).toEqual(receipt);
});

test("tampered or missing source fails before any import", async () => {
  const { home, note } = await fixture();
  await Bun.write(join(home, "scan.txt"), "Changed scan");
  await expect(prepareNote(JSON.stringify(note), home)).rejects.toThrow("SHA-256");
});

test("a conflicting mirror prevents all writes, and replacement requires the previous content hash", async () => {
  const { home, note, prepared } = await fixture();
  await importNote(home, prepared, { apply: true });
  note.observations = "Nouvelle lecture corrigée et vérifiée.";
  const updated = await prepareNote(JSON.stringify(note), home);
  await expect(importNote(home, updated, { apply: true })).rejects.toThrow("Existing note differs");
  expect(
    await Bun.file(join(home, "notes", "inbox", `${note.id}-${updated.digest}.md`)).exists(),
  ).toBe(false);
  await importNote(home, updated, { apply: true, previousSha256: sha256(prepared.markdown) });
  expect(await Bun.file(join(home, "memory", `${note.id}.md`)).text()).toBe(updated.markdown);
});

test("rejects public promotion, unsafe identifiers, sensitive content and unreviewed claims", async () => {
  const { note } = await fixture();
  for (const patch of [
    { visibility: "public" },
    { id: "../escape" },
    { review: undefined },
    { observations: "password=do-not-import" },
    { sources: [] },
    { sources: [{ ...note.sources[0], url: "https://dragonball.fandom.com/wiki/Test" }] },
  ])
    expect(() => validateNote({ ...note, ...patch })).toThrow();
});

test("a reviewed observation cannot cite a scan SHA omitted from declared source archives", async () => {
  const { home, note } = await fixture();
  const missing = sha256("Another reviewed scan");
  note.observations += ` Source SHA-256 ${missing}.`;
  await expect(prepareNote(JSON.stringify(note), home)).rejects.toThrow(
    "must be declared and archived",
  );
  await Bun.write(join(home, "another-scan.txt"), "Another reviewed scan");
  note.sources.push({
    file: "another-scan.txt",
    sha256: missing,
    locator: "Second inspected panel",
  });
  const prepared = await prepareNote(JSON.stringify(note), home);
  const receipt = await importNote(home, prepared, { apply: true });
  expect(receipt.attachments).toHaveLength(2);
  expect(await Bun.file(receipt.attachments[1]!).text()).toBe("Another reviewed scan");
});

test("refuses a memory destination redirected outside the active home", async () => {
  const { home, prepared } = await fixture();
  const outside = mkdtempSync(join(tmpdir(), "shenron-outside-"));
  roots.push(outside);
  symlinkSync(outside, join(home, "memory"), process.platform === "win32" ? "junction" : "dir");
  await expect(importNote(home, prepared, { apply: true })).rejects.toThrow("escapes");
  expect(await Bun.file(join(home, "notes", "curated", "manga-eye-shape.md")).exists()).toBe(false);
});

test("the existing Shenron RAG retrieves the curated memory privately and excludes it publicly", async () => {
  const { home, prepared } = await fixture();
  await importNote(home, prepared, { apply: true });
  // Same memory file, corpus, provenance metadata and writer as build-vfs.ts's complet profile.
  const text = await Bun.file(join(home, "memory", `${prepared.note.id}.md`)).text();
  const db = new Database(":memory:");
  try {
    applyVfsSchema(db);
    const writer = createRagWriter(db, "none");
    writer.add(
      {
        corpus: "home",
        entity_id: `shenron:home:memory/${prepared.note.id}.md:0`,
        title: prepared.note.title,
        url: null,
        content: text,
        metadata: { kind: "home", lang: "fr", originSourceId: "agent_home" },
        updated_at: prepared.note.observedAt,
        embedding: null,
        model: null,
      },
      "private",
    );
    writer.finish();
    const rag = new VfsRag(db);
    const hits = rag.search("contour extérieur", { corpus: ["home"] });
    expect(hits).toHaveLength(1);
    expect(hits[0]!.content).toContain(prepared.note.sources[0]!.sha256);
    expect(hits[0]!.content).toContain(prepared.note.limitations);
    expect(rag.search("contour extérieur", { publicOnly: true })).toHaveLength(0);
  } finally {
    db.close();
  }
});

test("archived attachments survive deletion of the temporary source; reviewed notes export to the real VFS consumer", async () => {
  const { home, prepared } = await fixture();
  const imported = await importNote(home, prepared, { apply: true });
  const attached = imported.attachments[0]!;
  expect(sha256(await Bun.file(attached).arrayBuffer())).toBe(prepared.note.sources[0]!.sha256);
  expect(await Bun.file(join(home, "memory", prepared.note.id + ".md")).text()).toContain(
    "(attachments/",
  );
  rmSync(join(home, "scan.txt"));
  const preview = await indexPrivateNotes(home);
  expect(await Bun.file(preview.output).exists()).toBe(false);
  const receipt = await indexPrivateNotes(home, true, async (text) => [{ text }]);
  const opened = openShenronVfs(receipt.output, { readOnly: true });
  try {
    expect(opened.vfs.profile).toBe("complet");
    expect(opened.vfs.readTextSync(`/home/memory/${prepared.note.id}.md`)).toContain(
      prepared.note.limitations,
    );
    expect(opened.rag.search("contour extérieur")).toHaveLength(1);
    expect(opened.rag.search("contour extérieur", { publicOnly: true })).toHaveLength(0);
  } finally {
    opened.vfs.db.close();
  }
  await Bun.write(join(home, "memory", prepared.note.id + ".md"), "Unreviewed modification");
  await expect(indexPrivateNotes(home, true)).rejects.toThrow("review and import");
});

test.skipIf(process.platform === "win32")(
  "private VFS is mode 0600 before note chunking and stays private after atomic replacement",
  async () => {
    const { home, prepared } = await fixture();
    await importNote(home, prepared, { apply: true });
    const output = join(home, "notes", "private-notes-vfs.sqlite");
    const receipt = await indexPrivateNotes(home, true, async (text) => {
      expect(statSync(output + `.${process.pid}.tmp`).mode & 0o777).toBe(0o600);
      return [{ text }];
    });
    expect(statSync(receipt.output).mode & 0o777).toBe(0o600);
  },
);
