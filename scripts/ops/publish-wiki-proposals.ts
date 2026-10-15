#!/usr/bin/env bun
/** Publish reviewed prose through the existing administrative CAS writer only. */
import { chmod } from "node:fs/promises";
import {
  candidateFor,
  attachSectionContexts,
  qualifyOfficialSource,
  validateDraft,
  type Evidence,
  type Candidate,
} from "./wiki-fill-agents";
import { wikiUpdateSnapshotHash } from "../../apps/site/src/lib/wiki-update-precondition";

type Row = Record<string, unknown>;
export type Operation = {
  key: string;
  method: string;
  path: string;
  body: Row & { expected: Row; expectedSha256: string };
  evidence: Evidence[];
  draft: unknown;
  review: { decision: string; reason: string };
  discoveryContext?: Candidate["discoveryContext"];
};
export type Backup = { path: string; sha256: string; tables: string[]; pgRestoreVerified: boolean };
type Requester = (path: string, init?: RequestInit) => Promise<Response>;
const digest = (value: string | Uint8Array) =>
  new Bun.CryptoHasher("sha256").update(value).digest("hex");

export function validateOperation(operation: Operation) {
  const match = /^\/api\/wiki-admin\/([a-z_]+)\/([^/?#]+)$/.exec(operation.path);
  if (!match || operation.method !== "PATCH" || !/^[a-f0-9]{64}$/.test(operation.key))
    throw Error("Invalid publication operation");
  const table = match[1]!;
  const candidate = candidateFor(table, operation.body.expected);
  if (
    !candidate ||
    candidate.id !== decodeURIComponent(match[2]!) ||
    candidate.sha256 !== operation.body.expectedSha256
  )
    throw Error("Publication snapshot identity mismatch");
  if (operation.review?.decision !== "approve" || !operation.review.reason.trim())
    throw Error("Independent approval required");
  if (table === "db_wiki_sections") candidate.discoveryContext = operation.discoveryContext;
  const draft = validateDraft(operation.draft, candidate, operation.evidence);
  const changes = Object.fromEntries(draft.changes.map((change) => [change.field, change.value]));
  const { expected: _snapshot, expectedSha256: _hash, ...supplied } = operation.body;
  if (
    draft.decision !== "propose" ||
    wikiUpdateSnapshotHash(changes) !== wikiUpdateSnapshotHash(supplied)
  )
    throw Error("Publication differs from reviewed draft");
  if (!operation.evidence.length || operation.evidence.some((source) => source.kind !== "official"))
    throw Error("This publisher requires qualified official sources");
  return { table, id: candidate.id, changes };
}

async function jsonResponse(response: Response) {
  if (!response.ok) throw Error(`Administrative request failed (${response.status})`);
  return (await response.json()) as Row;
}

/** Resolve the section's parent again; exported identity is never sufficient authority. */
export async function verifySectionContext(operation: Operation, request: Requester) {
  if (!operation.path.startsWith("/api/wiki-admin/db_wiki_sections/")) return;
  const supplied = operation.discoveryContext;
  const parent = supplied?.parent;
  if (
    !parent ||
    !/^db_[a-z_]+$/.test(parent.table) ||
    parent.id !== String(operation.body.expected.entityId) ||
    parent.apiPath !== `/api/wiki-admin/${parent.table}/${encodeURIComponent(parent.id)}`
  )
    throw Error("Canonical section parent reference required");
  const row = await jsonResponse(await request(parent.apiPath));
  const currentParent = candidateFor(parent.table, row);
  const section = candidateFor("db_wiki_sections", operation.body.expected);
  if (!currentParent || !section || currentParent.sha256 !== parent.expectedSha256)
    throw Error("Section parent changed; regenerate proposal");
  const observed = attachSectionContexts([section, currentParent])[0]?.discoveryContext;
  if (!observed || wikiUpdateSnapshotHash(observed) !== wikiUpdateSnapshotHash(supplied!))
    throw Error("Section context differs from its canonical parent");
}

export async function planOperation(operation: Operation, request: Requester) {
  const identity = validateOperation(operation);
  await verifySectionContext(operation, request);
  const current = await jsonResponse(await request(operation.path));
  if (wikiUpdateSnapshotHash(current) !== operation.body.expectedSha256)
    throw Error("Administrative snapshot changed; regenerate proposal");
  for (const source of operation.evidence) {
    const qualified = await qualifyOfficialSource({
      url: source.sourceUrl,
      title: source.document,
      quote: source.excerpt,
      identityQuote: source.identityQuote,
    });
    if (qualified.evidence.textSha256 !== source.textSha256)
      throw Error("Primary source changed; regenerate proposal");
  }
  return identity;
}

/** A false hash on an unchanged value proves that the live server enforces CAS. */
export async function probeCas(operation: Operation, request: Requester) {
  const { changes } = validateOperation(operation);
  const field = Object.keys(changes)[0]!;
  const response = await request(operation.path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      [field]: operation.body.expected[field],
      expected: operation.body.expected,
      expectedSha256: "0".repeat(64),
    }),
  });
  const body = (await response.json()) as Row;
  if (response.status !== 409 || body.error !== "wiki_update_precondition_changed")
    throw Error("Live canonical writer has not demonstrated CAS enforcement");
}

export async function applyOperation(operation: Operation, request: Requester, backup: Backup) {
  const { table, id, changes } = validateOperation(operation);
  await verifySectionContext(operation, request);
  const bytes = await Bun.file(backup.path).bytes();
  if (
    !backup.pgRestoreVerified ||
    !backup.tables.includes(`bot.${table}`) ||
    !backup.tables.includes("public.wiki_revisions") ||
    bytes.length < 5 ||
    new TextDecoder().decode(bytes.slice(0, 5)) !== "PGDMP" ||
    digest(bytes) !== backup.sha256
  )
    throw Error("Verified PostgreSQL backup required");
  const current = await jsonResponse(await request(operation.path));
  const after = { ...operation.body.expected, ...changes };
  const expectedAfter = wikiUpdateSnapshotHash(after);
  const replay = wikiUpdateSnapshotHash(current) === expectedAfter;
  if (!replay) {
    if (wikiUpdateSnapshotHash(current) !== operation.body.expectedSha256)
      throw Error("Administrative snapshot changed; no publication attempted");
    await probeCas(operation, request);
    await jsonResponse(
      await request(operation.path, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(operation.body),
      }),
    );
  }
  const independent = await jsonResponse(await request(operation.path));
  if (wikiUpdateSnapshotHash(independent) !== expectedAfter)
    throw Error("Independent administrative readback mismatch");
  const history = await jsonResponse(
    await request(`/api/wiki-history?table=${table}&rowId=${encodeURIComponent(id)}&limit=100`),
  );
  const revisions = Array.isArray(history.rows) ? (history.rows as Row[]) : [];
  const revision = revisions.find(
    (row) =>
      row.action === "update" &&
      row.tableName === table &&
      String(row.rowId) === id &&
      Object.keys(changes).every(
        (field) =>
          (row.before as Row)?.[field] === operation.body.expected[field] &&
          (row.after as Row)?.[field] === changes[field],
      ),
  );
  if (!revision) throw Error("Publication revision missing; investigate before continuing");
  return {
    key: operation.key,
    table,
    id,
    replay,
    afterSha256: expectedAfter,
    revisionId: revision.id,
    verifiedAt: new Date().toISOString(),
  };
}

async function writePrivate(path: string, value: unknown) {
  await Bun.write(path, JSON.stringify(value, null, 2));
  await chmod(path, 0o600);
}

async function main() {
  const [command, manifestPath, manifestSha256, planPath, backupPath] = process.argv.slice(2);
  if (!manifestPath || !planPath || !["plan", "apply"].includes(command ?? ""))
    throw Error(
      "Usage: publish-wiki-proposals.ts plan|apply MANIFEST SHA256 PLAN [BACKUP_RECEIPT]",
    );
  const manifestBytes = await Bun.file(manifestPath).bytes();
  if (digest(manifestBytes) !== manifestSha256) throw Error("Manifest checksum mismatch");
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as {
    schemaVersion: number;
    operations: Operation[];
  };
  if (
    manifest.schemaVersion !== 1 ||
    !manifest.operations.length ||
    manifest.operations.length > 200
  )
    throw Error("Invalid or unbounded manifest");
  const token = process.env.SHENRON_API_ADMIN_TOKEN;
  if (!token) throw Error("Protected administrative credential required");
  const request: Requester = (path, init = {}) =>
    fetch(new URL(path, "https://dragonballfr.com"), {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(30000),
      headers: {
        ...Object.fromEntries(new Headers(init.headers)),
        Authorization: `Bearer ${token}`,
      },
    });
  if (command === "plan") {
    const operations = [];
    for (const operation of manifest.operations)
      operations.push({ key: operation.key, ...(await planOperation(operation, request)) });
    await writePrivate(planPath, {
      schemaVersion: 1,
      manifestSha256,
      createdAt: new Date().toISOString(),
      operations,
    });
    console.log(JSON.stringify({ stage: "plan", operations: operations.length, manifestSha256 }));
  } else {
    const plan = await Bun.file(planPath).json();
    if (
      plan.manifestSha256 !== manifestSha256 ||
      !Number.isFinite(Date.parse(plan.createdAt)) ||
      Date.now() - Date.parse(plan.createdAt) > 3600000 ||
      JSON.stringify(plan.operations.map((entry: { key: string }) => entry.key)) !==
        JSON.stringify(manifest.operations.map((entry) => entry.key))
    )
      throw Error("Fresh matching publication plan required");
    if (!backupPath) throw Error("Backup receipt required");
    const backup = (await Bun.file(backupPath).json()) as Backup;
    for (const operation of manifest.operations) {
      const receipt = await applyOperation(operation, request, backup);
      await writePrivate(`${planPath}.${operation.key}.receipt.json`, receipt);
      console.log(JSON.stringify(receipt));
    }
  }
}
if (import.meta.main)
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Wiki publication failed");
    process.exitCode = 1;
  });
