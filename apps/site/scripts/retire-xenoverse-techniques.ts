#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import {
  assertReviewedXenoverseRetirement,
  XENOVERSE_ONLY_TECHNIQUES,
  XENOVERSE_FESTIVAL_SOURCE,
  XENOVERSE_DUAL_SOURCE,
  XENOVERSE_GAME_BUFF_SOURCE,
} from "../src/lib/technique-publication-policy";
import { wikiUpdateSnapshotHash } from "../src/lib/wiki-update-precondition";

const origin = "https://dragonballfr.com";

/** Retire only reviewed game reward variants through the journaled visibility writer. */
export async function retireXenoverseTechniques(options: {
  apply: boolean;
  reportDirectory: string;
  token: string;
}) {
  if (!options.token) throw new Error("An authorized site administration credential is required");
  const headers = {
    authorization: `Bearer ${options.token}`,
    "content-type": "application/json",
  };
  async function read(id: number) {
    const response = await fetch(`${origin}/api/wiki-admin/db_techniques/${id}`, {
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Administrative read ${id} failed: ${response.status}`);
    return (await response.json()) as Record<string, unknown>;
  }

  const plan = [];
  for (const entry of XENOVERSE_ONLY_TECHNIQUES) {
    const before = await read(entry.id);
    assertReviewedXenoverseRetirement(before);
    if (before.visible === false) continue;
    if (before.visible !== true) throw new Error(`Unknown visibility for ${entry.id}`);
    plan.push({
      id: entry.id,
      name: entry.name,
      method: "POST",
      url: `${origin}/api/wiki-admin/db_techniques?as=visibility`,
      before,
      expectedSha256: wikiUpdateSnapshotHash(before),
      body: { id: entry.id, visible: false },
    });
  }
  const directory = options.reportDirectory.replace(/[\\/]$/, "");
  await Bun.write(
    `${directory}/retirement-plan.json`,
    JSON.stringify(
      {
        sources: [XENOVERSE_FESTIVAL_SOURCE, XENOVERSE_DUAL_SOURCE, XENOVERSE_GAME_BUFF_SOURCE],
        apply: options.apply,
        plan,
      },
      null,
      2,
    ),
  );
  if (!options.apply) return { proposed: plan.length, completed: 0 };

  const completed = [];
  for (const operation of plan) {
    // This existing visibility API has no atomic CAS contract. Refuse any observed
    // drift immediately before writing and preserve every editorial content field.
    if (wikiUpdateSnapshotHash(await read(operation.id)) !== operation.expectedSha256) {
      throw new Error(`Retirement snapshot changed for ${operation.id}`);
    }
    const response = await fetch(operation.url, {
      method: operation.method,
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify(operation.body),
    });
    if (!response.ok) throw new Error(`Retirement ${operation.id} failed: ${response.status}`);
    const after = await read(operation.id);
    if (
      wikiUpdateSnapshotHash(after) !==
      wikiUpdateSnapshotHash({ ...operation.before, visible: false })
    ) {
      throw new Error(`Readback mismatch for ${operation.id}`);
    }
    completed.push({ id: operation.id, name: operation.name, visible: after.visible });
    await Bun.write(
      `${directory}/retirement-receipt.json`,
      JSON.stringify(
        {
          sources: [XENOVERSE_FESTIVAL_SOURCE, XENOVERSE_DUAL_SOURCE, XENOVERSE_GAME_BUFF_SOURCE],
          completed,
          checkedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  }
  return { proposed: plan.length, completed: completed.length };
}

if (import.meta.main) {
  const token =
    process.env.SHENRON_ADMIN_TOKEN ||
    (await Bun.secrets.get({ service: "shenron-mcp", name: "owner-admin" })) ||
    "";
  const reportArgument = process.argv.indexOf("--report-directory");
  const reportDirectory =
    reportArgument >= 0
      ? process.argv[reportArgument + 1]
      : "var/reports/technique-xenoverse-retirement-20261026";
  if (!reportDirectory) throw new Error("Missing report directory");
  console.log(
    JSON.stringify(
      await retireXenoverseTechniques({
        apply: process.argv.includes("--apply"),
        token,
        reportDirectory,
      }),
    ),
  );
}
