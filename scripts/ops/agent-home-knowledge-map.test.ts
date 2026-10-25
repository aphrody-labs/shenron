// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { importNote, prepareNote, sha256 } from "./agent-home-notes";
import { renderKnowledgeMap, writeKnowledgeMap } from "./agent-home-knowledge-map";
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const temporary = () => {
  const root = mkdtempSync(join(tmpdir(), "shenron-map-"));
  roots.push(root);
  return root;
};

test("navigation states its limits and preserves safe Markdown links", () => {
  const text = renderKnowledgeMap([
    { id: "reviewed-note", title: "Note [revue]", reviewedAt: "2026-10-25" },
  ]);
  expect(text).toContain("[Note (revue)](reviewed-note.md)");
  expect(text).toContain("canonical_evidence: false");
  expect(text).toContain("ne constitue pas une preuve canonique ni un second cerveau complet");
  expect(text).toContain("notes/inbox");
  expect(text).toContain("Une image de candidat ou générée");
});

test("the map shares the current-note review gate, excludes draft and manifest sidecars, and preserves its previous version on review drift", async () => {
  const home = temporary();
  await Bun.write(join(home, "scan.txt"), "Inspected scan");
  const note = {
    version: 1,
    id: "reviewed-note",
    title: "Note revue",
    status: "reviewed",
    visibility: "private",
    continuity: "Manga",
    observedAt: "2026-10-25",
    observations: "Observation bornée.",
    limitations: "Une seule case.",
    sources: [{ file: "scan.txt", sha256: sha256("Inspected scan"), locator: "Planche 1" }],
    review: { by: "editor", at: "2026-10-25" },
  };
  await importNote(home, await prepareNote(JSON.stringify(note), home), { apply: true });
  await importNote(
    home,
    await prepareNote(
      JSON.stringify({ ...note, id: "draft-note", status: "draft", review: undefined }),
      home,
    ),
    { apply: true },
  );
  await Bun.write(join(home, "notes/reviews/reviewed-note.manifest.json"), JSON.stringify(note));
  const preview = await writeKnowledgeMap(home);
  expect(preview.notes).toBe(1);
  expect(await Bun.file(preview.path).exists()).toBe(false);
  const written = await writeKnowledgeMap(home, true);
  const content = await Bun.file(written.path).text();
  expect(content).toContain("(reviewed-note.md)");
  expect(content).not.toContain("draft-note");
  await Bun.write(join(home, "memory/reviewed-note.md"), "Unreviewed modification");
  await expect(writeKnowledgeMap(home, true)).rejects.toThrow("review and import");
  expect(await Bun.file(written.path).text()).toBe(content);
});

test("a generated map never overwrites an unrelated manually maintained note", async () => {
  const home = temporary();
  await Bun.write(join(home, "memory/Knowledge-map.md"), "Private manual note");
  await expect(writeKnowledgeMap(home, true)).rejects.toThrow("unrelated vault note");
  expect(await Bun.file(join(home, "memory/Knowledge-map.md")).text()).toBe("Private manual note");
});
