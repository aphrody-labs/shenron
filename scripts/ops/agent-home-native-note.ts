#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { homedir } from "node:os";
import { resolve, join } from "node:path";
import { validateNote, sha256 } from "./agent-home-notes";

export interface NativeNotePlanInput {
  home: string;
  manifestPath: string;
  expectedSourceSha256: string;
  expectedManifestSha256: string;
  /** Native dbfr workspace on the owner host (default SHENRON_DBFR_WORKSPACE, else ~/.aphrody/workspaces/dbfr). */
  remoteHome?: string;
}

export function defaultRemoteHome(env: Record<string, string | undefined> = process.env): string {
  return (
    env.SHENRON_DBFR_WORKSPACE?.trim() ||
    `${(env.HOME ?? homedir()).replaceAll("\\", "/")}/.aphrody/workspaces/dbfr`
  );
}
/** Prepare a verifiable native-owner invocation; never connect, stage remotely or mutate a store. */
export async function prepareNativeNoteImport(input: NativeNotePlanInput) {
  for (const digest of [input.expectedSourceSha256, input.expectedManifestSha256])
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("Explicit SHA-256 values required");
  const manifestText = await Bun.file(input.manifestPath).text();
  if (sha256(manifestText) !== input.expectedManifestSha256)
    throw new Error("Manifest SHA-256 changed");
  const note: unknown = JSON.parse(manifestText);
  validateNote(note);
  if (note.status !== "reviewed" || note.visibility !== "private")
    throw new Error("Only a reviewed private note can be planned");
  const sourcePath = resolve(input.home, "memory", `${note.id}.md`);
  const source = await Bun.file(sourcePath).arrayBuffer();
  if (sha256(source) !== input.expectedSourceSha256) throw new Error("Source note SHA-256 changed");
  const review = await Bun.file(join(input.home, "notes", "reviews", `${note.id}.json`)).json();
  if (
    review.id !== note.id ||
    review.manifestSha256 !== input.expectedManifestSha256 ||
    review.markdownSha256 !== input.expectedSourceSha256 ||
    review.reviewedAt !== note.review!.at
  )
    throw new Error("Canonical review registry differs from the approved note");
  const attachments = [];
  for (const reference of note.sources) {
    const extension = reference.file.match(/\.[a-z0-9]+$/i)?.[0].toLowerCase();
    if (!extension) throw new Error("Source attachment has no extension");
    const path = join(input.home, "memory", "attachments", `${reference.sha256}${extension}`);
    if (sha256(await Bun.file(path).arrayBuffer()) !== reference.sha256)
      throw new Error("Archived source attachment SHA-256 changed");
    attachments.push({
      sha256: reference.sha256,
      locator: reference.locator,
      archivedPath: path,
      url: reference.url ?? null,
      kind: reference.kind ?? "reference",
    });
  }
  const remoteHome = input.remoteHome ?? defaultRemoteHome();
  const label = `wiki-reviewed-note-${note.id}`;
  const indexRoot = `${remoteHome}/notes/native-index-input/${note.id}`;
  return {
    version: 1,
    mode: "prepared-only",
    remoteMutationExecuted: false,
    visibility: "private",
    noteId: note.id,
    source: { path: sourcePath, sha256: input.expectedSourceSha256, bytes: source.byteLength },
    manifest: { path: resolve(input.manifestPath), sha256: input.expectedManifestSha256 },
    review: { by: note.review!.by, at: note.review!.at },
    attachments,
    destination: {
      host: "dbfr",
      profile: "dbfr",
      home: remoteHome,
      canonicalVaultNote: `${remoteHome}/memory/${note.id}.md`,
    },
    scope: {
      label,
      indexRoot,
      requiredFiles: [`${note.id}.md`],
      expectedIndexedDocuments: 1,
      recursiveHomeScan: false,
      labelMustNotBelongToAnotherRoot: true,
    },
    preparationRequirements: [
      "Review and transfer the canonical private note, review registry and content-addressed attachments using the existing bridge; verify every SHA on DBFR",
      "Verify the dedicated source label is absent or already belongs exclusively to this exact one-note root; never reuse a broad source label",
      "Create the dedicated index directory with only the exact reviewed Markdown; no attachments, manifests, drafts or other notes inside this index input",
      "Verify the Markdown SHA again immediately before native indexing; preserve canonical vault attachments and relative links outside this staging input",
    ],
    commands: {
      status: ["aphrody", "home", "--profile", "dbfr", "status"],
      backup: ["aphrody", "home", "--profile", "dbfr", "backup"],
      index: ["aphrody", "home", "--profile", "dbfr", "index", "--label", label, indexRoot],
      query: [
        "aphrody",
        "home",
        "--profile",
        "dbfr",
        "query",
        "--kind",
        "chunk",
        "--limit",
        "10",
        input.expectedManifestSha256,
      ],
    },
    retrieval: {
      nativeIndexMode: "lexical",
      vectorsGenerated: false,
      semanticHybridQualified: false,
      note: "The inspected native home CLI builds RagIndexer without an embedder; no embedding model or provider is configured by this plan",
    },
    acceptance: {
      notePath: `${label}:${note.id}.md`,
      errors: 0,
      indexedOrUnchangedDocuments: 1,
      removedDocuments: 0,
      queryMustContainExpectedNotePath: true,
      preserveOtherSources: true,
      repeatNativeIndexMustBeIdempotent: true,
    },
  };
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  if (args.includes("--apply"))
    throw new Error(
      "Remote mutation is not implemented; this command only prepares a reviewed plan",
    );
  const value = (flag: string) => {
    const index = args.indexOf(flag);
    if (index < 0 || !args[index + 1]) throw new Error(`Missing ${flag}`);
    return args[index + 1]!;
  };
  const plan = await prepareNativeNoteImport({
    home: value("--home"),
    manifestPath: value("--manifest"),
    expectedSourceSha256: value("--expected-source-sha"),
    expectedManifestSha256: value("--expected-manifest-sha"),
    ...(args.includes("--remote-home") ? { remoteHome: value("--remote-home") } : {}),
  });
  await Bun.write(value("--out"), `${JSON.stringify(plan, null, 2)}\n`);
  console.log(
    JSON.stringify({
      mode: plan.mode,
      noteId: plan.noteId,
      sourceSha256: plan.source.sha256,
      remoteMutationExecuted: false,
    }),
  );
}
