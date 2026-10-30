// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { defaultRemoteHome, prepareNativeNoteImport } from "./agent-home-native-note";
import { sha256 } from "./agent-home-notes";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    const absolute = resolve(root);
    if (
      !absolute.startsWith(resolve(tmpdir()) + sep) ||
      !basename(absolute).startsWith("shenron-native-note-")
    )
      throw new Error("Refuse cleanup outside the owned native-note fixtures");
    rmSync(absolute, { recursive: true, force: true });
  }
});
async function fixture() {
  const home = mkdtempSync(join(tmpdir(), "shenron-native-note-"));
  roots.push(home);
  const id = "reviewed-test-note";
  const source = "# Private reviewed evidence\n\nAn observed manga panel.\n";
  const attachment = "Source transcript";
  const attachmentSha = sha256(attachment);
  const note = {
    version: 1,
    id,
    title: "Reviewed test",
    status: "reviewed",
    visibility: "private",
    continuity: "Original manga",
    observedAt: "2026-10-25",
    observations: "Panel observed",
    limitations: "Single panel only",
    review: { by: "Reviewer", at: "2026-10-25T12:00:00Z" },
    sources: [{ file: "source.TXT", sha256: attachmentSha, locator: "Volume27, page168" }],
  };
  const manifest = JSON.stringify(note);
  const manifestPath = join(home, "fixture-manifest.json");
  await Bun.write(manifestPath, manifest);
  await Bun.write(join(home, "memory", `${id}.md`), source);
  await Bun.write(join(home, "memory", "attachments", `${attachmentSha}.txt`), attachment);
  await Bun.write(
    join(home, "notes", "reviews", `${id}.json`),
    JSON.stringify({
      id,
      manifestSha256: sha256(manifest),
      markdownSha256: sha256(source),
      reviewedAt: note.review.at,
    }),
  );
  return {
    home,
    manifestPath,
    expectedSourceSha256: sha256(source),
    expectedManifestSha256: sha256(manifest),
    id,
    source,
    attachmentSha,
  };
}

test("a verified note produces only a private one-note native plan and no store or remote effects", async () => {
  const input = await fixture();
  const plan = await prepareNativeNoteImport({
    ...input,
    remoteHome: "/srv/owner/.aphrody/workspaces/dbfr",
  });
  expect(plan.mode).toBe("prepared-only");
  expect(plan.remoteMutationExecuted).toBe(false);
  expect(plan.visibility).toBe("private");
  expect(plan.scope.requiredFiles).toEqual([`${input.id}.md`]);
  expect(plan.scope.expectedIndexedDocuments).toBe(1);
  expect(plan.scope.recursiveHomeScan).toBe(false);
  expect(plan.commands.index).toEqual([
    "aphrody",
    "home",
    "--profile",
    "dbfr",
    "index",
    "--label",
    `wiki-reviewed-note-${input.id}`,
    `/srv/owner/.aphrody/workspaces/dbfr/notes/native-index-input/${input.id}`,
  ]);
  expect(plan.retrieval.semanticHybridQualified).toBe(false);
  expect(await Bun.file(join(input.home, "memory", `${input.id}.md`)).text()).toBe(input.source);
  expect(await Bun.file(join(input.home, "db", "aphrody.sqlite")).exists()).toBe(false);
});
test("stale source bytes, manifest bytes, review registry or attachment bytes are rejected", async () => {
  const input = await fixture();
  await expect(
    prepareNativeNoteImport({ ...input, expectedSourceSha256: "a".repeat(64) }),
  ).rejects.toThrow("Source note SHA");
  await expect(
    prepareNativeNoteImport({ ...input, expectedManifestSha256: "b".repeat(64) }),
  ).rejects.toThrow("Manifest SHA");
  const reviewPath = join(input.home, "notes", "reviews", `${input.id}.json`);
  const review = await Bun.file(reviewPath).text();
  await Bun.write(reviewPath, "{}");
  await expect(prepareNativeNoteImport(input)).rejects.toThrow("review registry");
  await Bun.write(reviewPath, review);
  await Bun.write(
    join(input.home, "memory", "attachments", `${input.attachmentSha}.txt`),
    "Changed evidence",
  );
  await expect(prepareNativeNoteImport(input)).rejects.toThrow("Archived source attachment SHA");
});
test("drafts cannot be promoted by preparing a native index plan", async () => {
  const input = await fixture();
  const draft = { ...(await Bun.file(input.manifestPath).json()), status: "draft" };
  const content = JSON.stringify(draft);
  await Bun.write(input.manifestPath, content);
  await expect(
    prepareNativeNoteImport({ ...input, expectedManifestSha256: sha256(content) }),
  ).rejects.toThrow("reviewed private note");
});
test("the CLI refuses --apply before any file lookup or native invocation", async () => {
  const child = Bun.spawn(
    [process.execPath, join(import.meta.dir, "agent-home-native-note.ts"), "--apply"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const stderr = await new Response(child.stderr).text();
  expect(await child.exited).not.toBe(0);
  expect(stderr).toContain("Remote mutation is not implemented");
  expect(stderr).not.toContain("ENOENT");
});

test("the remote workspace follows SHENRON_DBFR_WORKSPACE, else the home directory", () => {
  expect(defaultRemoteHome({ SHENRON_DBFR_WORKSPACE: "/w/dbfr" })).toBe("/w/dbfr");
  expect(defaultRemoteHome({ HOME: "/home/owner" })).toBe("/home/owner/.aphrody/workspaces/dbfr");
});
