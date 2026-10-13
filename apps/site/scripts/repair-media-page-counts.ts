// SPDX-License-Identifier: Apache-2.0
import { mkdir } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { closeDb } from "../src/lib/db";
import {
  getWikiRow,
  updateWiki,
  readMediaVolumePageReferenceInventory,
} from "../src/lib/wiki-admin";
import { recordRevision } from "../src/lib/wiki-revisions";
import {
  planMediaPageCounts,
  type VolumePageReferences,
} from "../../../scripts/ops/media-page-counts";

const digest = (value: string | Uint8Array) =>
  new Bun.CryptoHasher("sha256").update(value).digest("hex");

export async function repairMediaPageCounts(options: { jobDirectory: string; apply: boolean }) {
  if (!isAbsolute(options.jobDirectory))
    throw new Error("Private absolute repair directory required");
  const job = options.jobDirectory;
  const plan = await Bun.file(join(job, "counter-plan.json")).json();
  const inventory = Bun.file(join(job, "r2-inventory.json"));
  if (digest(await inventory.bytes()) !== plan.inventorySha256)
    throw new Error("Asset inventory changed");
  const assetEntries = (await inventory.json()).entries;
  const rows = await readMediaVolumePageReferenceInventory();
  const beforeRows = rows as unknown as VolumePageReferences[];
  const actualPlan = planMediaPageCounts(beforeRows, assetEntries);
  if (
    digest(JSON.stringify(beforeRows)) !== plan.beforeSha256 ||
    !Bun.deepEquals(plan.plan, actualPlan)
  ) {
    throw new Error("Page references or null pagination precondition changed");
  }
  if (!options.apply)
    return {
      dryRun: true,
      volumes: actualPlan.length,
      references: actualPlan.reduce((n, row) => n + row.pageCount, 0),
    };
  const backup = await Bun.file(join(job, "backup-receipt.json")).json();
  if (
    !backup.offHostVerified ||
    backup.host !== "dbfr" ||
    !/^[a-f0-9]{64}$/.test(backup.sha256) ||
    backup.bytes < 1
  ) {
    throw new Error("Qualified off-host backup required");
  }
  const changes = [];
  for (const item of actualPlan) {
    const before = await getWikiRow("media_volumes", String(item.id));
    if (!before || before.pageCount !== null) throw new Error("Pagination precondition changed");
    const after = await updateWiki(
      "media_volumes",
      String(item.id),
      { pageCount: item.pageCount },
      { expected: { pageCount: null } },
    );
    if (after.pageCount !== item.pageCount) throw new Error("Page counter writer readback differs");
    const untouched = (row: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(row).filter(([key]) => key !== "pageCount"));
    if (!Bun.deepEquals(untouched(before), untouched(after)))
      throw new Error("Unrelated volume fields changed");
    const revisionId = await recordRevision({
      table: "media_volumes",
      id: String(item.id),
      action: "update",
      before,
      after,
      actor: { id: null, name: "aphrody-dev" },
    });
    if (!revisionId) throw new Error("Pagination repair audit missing");
    const readback = await getWikiRow("media_volumes", String(item.id));
    if (readback?.pageCount !== item.pageCount)
      throw new Error("Independent pagination readback differs");
    changes.push({ id: item.id, before: null, after: item.pageCount, revisionId });
    await Bun.write(
      join(job, "repair-progress.json"),
      JSON.stringify({ changes, complete: false }, null, 2) + "\n",
    );
  }
  const receipt = {
    schema: "shenron-media-page-count-repair/v1",
    observedAt: new Date().toISOString(),
    complete: true,
    changes,
    volumes: changes.length,
    references: actualPlan.reduce((n, row) => n + row.pageCount, 0),
    inventorySha256: plan.inventorySha256,
    beforeSha256: plan.beforeSha256,
    backup,
    writer: "updateWiki-media-lock-with-null-CAS",
    columnsChanged: ["pageCount"],
  };
  await Bun.write(join(job, "repair-receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
  return receipt;
}

if (import.meta.main) {
  const directory = process.argv[2];
  if (!directory || !isAbsolute(directory))
    throw new Error("Usage: repair-media-page-counts <private-absolute-job-directory> [--apply]");
  await mkdir(directory, { recursive: true });
  try {
    const receipt = await repairMediaPageCounts({
      jobDirectory: directory,
      apply: process.argv.includes("--apply"),
    });
    console.log(
      JSON.stringify({
        dryRun: "dryRun" in receipt && receipt.dryRun,
        volumes: receipt.volumes,
        references: receipt.references,
        complete: "complete" in receipt && receipt.complete,
      }),
    );
  } catch (error) {
    await Bun.write(
      join(directory, "repair-error.json"),
      JSON.stringify({ message: String(error) }) + "\n",
    );
    console.error("Media page-count repair failed; inspect the protected job receipt");
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
