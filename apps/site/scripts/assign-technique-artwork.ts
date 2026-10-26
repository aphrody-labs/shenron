#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { wikiUpdateSnapshotHash } from "../src/lib/wiki-update-precondition";

export type TechniqueArtworkAssignment = {
  id: number;
  slug: string;
  name: string;
  expectedImage: string | null;
  image: string;
  icon: string;
  sha256: string;
  iconSha256: string;
  sourceUrl: string;
};

export function prepareTechniqueArtworkUpdate(
  entry: TechniqueArtworkAssignment,
  row: Record<string, unknown>,
) {
  if (!Number.isSafeInteger(entry.id) || entry.id < 1 || !/^[a-z0-9-]+$/.test(entry.slug))
    throw Error("Invalid reviewed identity");
  for (const [url, hash, extension] of [
    [entry.image, entry.sha256, "webp"],
    [entry.icon, entry.iconSha256, "svg"],
  ] as const) {
    if (
      !/^[a-f0-9]{64}$/.test(hash) ||
      url !== `https://cdn.dragonballfr.com/media/techniques/${entry.slug}/${hash}.${extension}`
    )
      throw Error("Unreviewed artifact address");
  }
  const source = new URL(entry.sourceUrl);
  if (
    source.origin !== "https://dragonballfr.com" ||
    !/^\/wiki\/(manga|episodes)\/\d+$/.test(source.pathname) ||
    source.username ||
    source.password
  )
    throw Error("Missing primary reference");
  if (
    row.id !== entry.id ||
    row.slug !== entry.slug ||
    row.name !== entry.name ||
    row.visible !== true
  )
    throw Error("Technique identity or visibility changed");
  if (row.image === entry.image) return null;
  if ((row.image ?? null) !== entry.expectedImage)
    throw Error("Editorial image changed since review");
  return { image: entry.image, expected: row, expectedSha256: wikiUpdateSnapshotHash(row) };
}

export async function assignTechniqueArtwork(
  entries: TechniqueArtworkAssignment[],
  token: string,
  output: string,
) {
  if (
    !entries.length ||
    entries.length > 100 ||
    new Set(entries.map((entry) => entry.id)).size !== entries.length
  )
    throw Error("Invalid bounded batch");
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const origin = "https://dragonballfr.com";
  const read = async (id: number) => {
    const response = await fetch(`${origin}/api/wiki-admin/db_techniques/${id}`, {
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw Error(`Administrative read failed ${response.status}`);
    return (await response.json()) as Record<string, unknown>;
  };
  const plans = [];
  for (const entry of entries) {
    const row = await read(entry.id);
    const body = prepareTechniqueArtworkUpdate(entry, row);
    for (const [url, sha256] of [
      [entry.image, entry.sha256],
      [entry.icon, entry.iconSha256],
    ]) {
      const response = await fetch(url!, { redirect: "error", signal: AbortSignal.timeout(20000) });
      if (
        !response.ok ||
        new Bun.CryptoHasher("sha256").update(await response.arrayBuffer()).digest("hex") !== sha256
      )
        throw Error(`Published bytes not verified for ${entry.slug}`);
    }
    plans.push({ entry, row, body });
  }
  await Bun.write(`${output}/before.json`, JSON.stringify(plans, null, 2));
  const completed = [];
  for (const { entry, row, body } of plans) {
    if (body) {
      const response = await fetch(`${origin}/api/wiki-admin/db_techniques/${entry.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok)
        throw Error(
          `Artwork update failed ${response.status} for ${entry.slug}; inspect completed receipt before resuming`,
        );
    }
    const after = await read(entry.id);
    if (
      after.image !== entry.image ||
      wikiUpdateSnapshotHash({ ...after, image: row.image }) !== wikiUpdateSnapshotHash(row)
    )
      throw Error(`Independent read-back mismatch for ${entry.slug}`);
    completed.push({
      id: entry.id,
      slug: entry.slug,
      image: entry.image,
      icon: entry.icon,
      sourceUrl: entry.sourceUrl,
      status: "applied-and-read-back",
    });
    await Bun.write(`${output}/receipt.json`, JSON.stringify({ completed }, null, 2));
    console.log(
      JSON.stringify({ assigned: completed.length, total: entries.length, slug: entry.slug }),
    );
  }
  return completed;
}

if (import.meta.main) {
  const input = Bun.argv[2];
  const outputIndex = Bun.argv.indexOf("--out");
  const output = outputIndex < 0 ? null : Bun.argv[outputIndex + 1];
  if (!input || !output || !Bun.argv.includes("--apply"))
    throw Error(
      "Usage: bun assign-technique-artwork.ts <reviewed.json> --apply --out <private-report-directory>",
    );
  const { entries } = (await Bun.file(input).json()) as { entries: TechniqueArtworkAssignment[] };
  const token = await Bun.secrets.get({ service: "shenron-mcp", name: "owner-admin" });
  if (!token) throw Error("Authorized administrative credential unavailable");
  await assignTechniqueArtwork(entries, token, output);
}
