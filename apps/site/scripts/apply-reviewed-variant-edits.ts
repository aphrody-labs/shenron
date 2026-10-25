#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import { assertVariantEvidenceUpdate } from "../src/lib/wiki-variant-evidence";
import { wikiUpdateSnapshotHash } from "../src/lib/wiki-update-precondition";

type Row = Record<string, unknown>;
const fields = [
  "summary",
  "role",
  "form",
  "powerLevel",
  "ki",
  "maxKi",
  "highlights",
  "techniqueIds",
  "transformationIds",
  "visible",
  "evidence",
] as const;
const source = z
  .object({
    kind: z.enum(["scan", "primary-document", "review-record"]),
    file: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    url: z.url().startsWith("https://"),
    locator: z.string().min(1),
  })
  .strict();
const entry = z
  .object({
    id: z.number().int().positive(),
    rationale: z.string().min(1),
    sources: z.array(source).min(1).max(16),
    expected: z.record(z.string(), z.unknown()),
    expectedSha256: z.string().regex(/^[a-f0-9]{64}$/),
    patch: z.partialRecord(z.enum(fields), z.unknown()),
  })
  .strict();
const schema = z.object({ version: z.literal(1), entries: z.array(entry).min(1).max(12) }).strict();
export type ReviewedVariantEntry = z.infer<typeof entry>;

export function validateReviewedVariantManifest(input: unknown) {
  const manifest = schema.parse(input);
  if (new Set(manifest.entries.map((item) => item.id)).size !== manifest.entries.length)
    throw new Error("Duplicate variant identity");
  for (const item of manifest.entries) {
    if (
      item.expected.id !== item.id ||
      typeof item.expected.characterId !== "number" ||
      typeof item.expected.sagaId !== "number" ||
      typeof item.expected.slug !== "string" ||
      !Object.hasOwn(item.expected, "evidence") ||
      !Object.hasOwn(item.expected, "visible") ||
      Object.keys(item.expected).length < 20 ||
      wikiUpdateSnapshotHash(item.expected) !== item.expectedSha256
    )
      throw new Error(`Incomplete or changed snapshot for ${item.id}`);
    if (!Object.keys(item.patch).length) throw new Error("Empty editorial patch");
    for (const [field, value] of Object.entries(item.patch)) {
      if (["highlights", "techniqueIds", "transformationIds"].includes(field)) {
        if (
          value !== null &&
          (!Array.isArray(value) ||
            value.some((part) =>
              field === "highlights"
                ? typeof part !== "string" || !part.trim()
                : !Number.isSafeInteger(part) || Number(part) < 1,
            ))
        )
          throw new Error(`Invalid ${field}`);
      } else if (field === "visible") {
        if (typeof value !== "boolean") throw new Error("Invalid visibility");
      } else if (field !== "evidence" && value !== null && typeof value !== "string")
        throw new Error(`Invalid text field ${field}`);
    }
    assertVariantEvidenceUpdate(item.expected, item.patch);
    for (const reference of item.sources) {
      const url = new URL(reference.url);
      if (
        url.username ||
        url.password ||
        url.port ||
        url.protocol !== "https:" ||
        ![
          "dragonballfr.com",
          "en.dragon-ball-official.com",
          "fr.dragon-ball-official.com",
          "jp.dragon-ball-official.com",
          "dragon-ball-official.com",
        ].includes(url.hostname) ||
        [...url.searchParams.keys()].some((key) =>
          /token|secret|auth|password|signature|credential|key/i.test(key),
        )
      )
        throw new Error("Unqualified primary source");
    }
  }
  return manifest;
}

export function prepareReviewedVariantEdit(item: ReviewedVariantEntry, current: Row) {
  const target = { ...item.expected, ...item.patch };
  const hash = wikiUpdateSnapshotHash(current);
  if (hash === wikiUpdateSnapshotHash(target)) return null;
  if (hash !== item.expectedSha256) throw new Error(`Snapshot drift for ${item.id}`);
  return { ...item.patch, expected: item.expected, expectedSha256: item.expectedSha256 };
}

export async function applyReviewedVariantEdits(
  value: unknown,
  options: {
    apply?: boolean;
    token?: string;
    receipt: string;
  },
) {
  const manifest = validateReviewedVariantManifest(value);
  const receiptSuffix = options.receipt
    .replaceAll("\\", "/")
    .replace(/^(?:\.\.\/\.\.\/)?var\/reports\//, "");
  if (
    receiptSuffix === options.receipt.replaceAll("\\", "/") ||
    receiptSuffix.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error(
      "Receipt must be a private file under var/reports from repository root or apps/site",
    );
  if (await Bun.file(options.receipt).exists())
    throw new Error("Use a new receipt path; preserve earlier audit receipts");
  for (const item of manifest.entries)
    for (const reference of item.sources) {
      const file = Bun.file(
        reference.file.startsWith("var/reports/")
          ? new URL(`../../../${reference.file}`, import.meta.url)
          : reference.file,
      );
      if (
        !(await file.exists()) ||
        new Bun.CryptoHasher("sha256").update(await file.bytes()).digest("hex") !== reference.sha256
      )
        throw new Error(`Reviewed source bytes unavailable or changed for ${item.id}`);
    }
  const receipt = {
    manifestSha256: wikiUpdateSnapshotHash(manifest),
    startedAt: new Date().toISOString(),
    apply: options.apply === true,
    entries: [] as Array<Record<string, unknown>>,
  };
  const save = () => Bun.write(options.receipt, JSON.stringify(receipt, null, 2));
  if (!options.apply) {
    receipt.entries = manifest.entries.map((item) => ({
      id: item.id,
      status: "validated-proposal-no-write",
      fields: Object.keys(item.patch),
    }));
    await save();
    return receipt;
  }
  if (!options.token) throw new Error("SHENRON_ADMIN_TOKEN required");
  const origin = "https://dragonballfr.com";
  const headers = { authorization: `Bearer ${options.token}`, "content-type": "application/json" };
  const path = (id: number) => `/api/wiki-admin/db_character_variants/${id}`;
  async function read(route: string, admin = true): Promise<any> {
    const response = await fetch(`${origin}${route}`, {
      headers: admin ? headers : {},
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Read HTTP ${response.status}`);
    return response.json();
  }
  // Qualify every complete snapshot before the first mutation; never rebase an approval silently.
  const planned = [];
  for (const item of manifest.entries) {
    const current = await read(path(item.id));
    const body = prepareReviewedVariantEdit(item, current);
    planned.push({ item, body });
    receipt.entries.push({
      id: item.id,
      status: body ? "preflight-qualified" : "already-applied",
      before: current,
    });
  }
  await save();
  for (const { item, body } of planned) {
    const result = receipt.entries.find((row) => row.id === item.id)!;
    if (body) {
      result.status = "write-started-inspect-state-before-retry";
      await save();
      const response = await fetch(`${origin}${path(item.id)}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(30000),
      });
      result.httpStatus = response.status;
      await save();
      if (!response.ok)
        throw new Error(`PATCH HTTP ${response.status} for ${item.id}; inspect receipt`);
    }
    const after = await read(path(item.id));
    result.after = after;
    await save();
    if (
      wikiUpdateSnapshotHash(after) !== wikiUpdateSnapshotHash({ ...item.expected, ...item.patch })
    )
      throw new Error(`Complete readback mismatch for ${item.id}`);
    const history = await read(
      `/api/wiki-history?table=db_character_variants&rowId=${item.id}&limit=50`,
    );
    const revision = history.rows?.find(
      (row: { before?: Row; after?: Row }) =>
        row.before &&
        row.after &&
        Object.keys(item.patch).every(
          (field) =>
            Bun.deepEquals(row.before![field], item.expected[field]) &&
            Bun.deepEquals(row.after![field], (item.patch as Row)[field]),
        ),
    );
    if (!revision) throw new Error(`Audited field delta not found for ${item.id}`);
    result.revisionId = revision.id;
    result.status = "admin-and-history-verified";
    await save();
  }
  const publicResult = await read(`/api/wiki/variants?review=${Date.now()}`, false);
  if (!Array.isArray(publicResult.variants)) throw new Error("Invalid public projection");
  for (const { item } of planned) {
    const visible = publicResult.variants.some((row: { id: number }) => Number(row.id) === item.id);
    if (visible !== Boolean({ ...item.expected, ...item.patch }.visible))
      throw new Error(`Public visibility mismatch for ${item.id}`);
  }
  for (const row of receipt.entries) row.status = "admin-history-public-visibility-verified";
  await save();
  return receipt;
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const value = (flag: string) => args[args.indexOf(flag) + 1];
  if (!args.includes("--manifest") || !args.includes("--receipt"))
    throw new Error(
      "Usage: bun scripts/apply-reviewed-variant-edits.ts --manifest <reviewed.json> --receipt <private.json> [--apply]",
    );
  const receipt = await applyReviewedVariantEdits(await Bun.file(value("--manifest")!).json(), {
    apply: args.includes("--apply"),
    token: process.env.SHENRON_ADMIN_TOKEN,
    receipt: value("--receipt")!,
  });
  console.log(
    JSON.stringify({
      apply: receipt.apply,
      entries: receipt.entries.map(({ id, status }) => ({ id, status })),
    }),
  );
}
