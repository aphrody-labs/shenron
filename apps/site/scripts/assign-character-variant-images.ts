#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { wikiUpdateSnapshotHash } from "../src/lib/wiki-update-precondition";

export type VariantImageEntry = {
  id: number;
  characterId: number;
  slug: string;
  image: string;
  expectedImage: string | null;
  sha256: string;
  kind: "portrait" | "scene";
  source: { url: string; title: string; visual: string };
};

/** Refuse drift, arbitrary media origins and replacement of an existing editorial image. */
export function prepareVariantImageUpdate(entry: VariantImageEntry, row: Record<string, unknown>) {
  if (!Number.isSafeInteger(entry.id) || entry.id < 1 || !Number.isSafeInteger(entry.characterId))
    throw new Error("Invalid reviewed identity");
  const image = new URL(entry.image);
  const source = new URL(entry.source.url);
  if (
    image.origin !== "https://cdn.dragonballfr.com" ||
    !/^\/assets\/(dbz|manga)\//.test(image.pathname) ||
    image.username ||
    image.password ||
    image.search ||
    image.hash
  )
    throw new Error("Unreviewed media origin");
  if (
    ![
      "dragonballfr.com",
      "en.dragon-ball-official.com",
      "de.dragon-ball-official.com",
      "dragon-ball-official.com",
    ].includes(source.hostname) ||
    source.protocol !== "https:" ||
    !entry.source.title ||
    !entry.source.visual ||
    !/^[a-f0-9]{64}$/.test(entry.sha256)
  )
    throw new Error("Missing reviewed provenance");
  if (!["portrait", "scene"].includes(entry.kind)) throw new Error("Unknown media kind");
  if (
    Number(row.id) !== entry.id ||
    Number(row.characterId) !== entry.characterId ||
    row.slug !== entry.slug ||
    row.visible !== true
  )
    throw new Error("Variant identity or visibility drifted");
  if (row.image === entry.image) return null;
  if (entry.expectedImage !== null || row.image !== null)
    throw new Error("Existing editorial image must be preserved");
  return { image: entry.image, expected: row, expectedSha256: wikiUpdateSnapshotHash(row) };
}

export async function assignVariantImages(
  entries: VariantImageEntry[],
  cookie?: string,
  apply = false,
  bearer?: string,
) {
  if (apply && !cookie && !bearer)
    throw new Error(
      "SHENRON_WIKI_ADMIN_COOKIE or SHENRON_ADMIN_TOKEN is required for site API access",
    );
  const origin = "https://dragonballfr.com";
  if (!apply)
    return entries.map((entry) => ({
      method: "PATCH",
      url: `${origin}/api/wiki-admin/db_character_variants/${entry.id}`,
      image: entry.image,
      kind: entry.kind,
      source: entry.source,
      status: "proposal-not-executed; complete administrative snapshot required before PATCH",
    }));
  const headers = {
    ...(cookie ? { cookie } : { authorization: `Bearer ${bearer}` }),
    "content-type": "application/json",
  };
  const planned = [];
  // Read and qualify the complete batch before the first mutation. Credentials only go to the site.
  for (const entry of entries) {
    const response = await fetch(`${origin}/api/wiki-admin/db_character_variants/${entry.id}`, {
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(`Administrative read failed (${response.status}) for ${entry.id}`);
    const row = (await response.json()) as Record<string, unknown>;
    const body = prepareVariantImageUpdate(entry, row);
    const image = await fetch(entry.image, {
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!image.ok || !image.headers.get("content-type")?.startsWith("image/"))
      throw new Error(`Reviewed image unavailable for ${entry.id}`);
    const hash = new Bun.CryptoHasher("sha256").update(await image.bytes()).digest("hex");
    if (hash !== entry.sha256) throw new Error(`Reviewed image changed for ${entry.id}`);
    planned.push({ entry, body });
  }
  const completed = [];
  for (const { entry, body } of planned) {
    if (!body) {
      completed.push({ id: entry.id, status: "already-applied" });
      continue;
    }
    const url = `${origin}/api/wiki-admin/db_character_variants/${entry.id}`;
    const updated = await fetch(url, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!updated.ok)
      throw new Error(
        `Image update failed (${updated.status}) for ${entry.id}; earlier entries may be applied, rerun safely after review`,
      );
    const reread = await fetch(url, {
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!reread.ok) throw new Error(`Read-back failed (${reread.status}) for ${entry.id}`);
    const after = (await reread.json()) as Record<string, unknown>;
    if (
      after.image !== entry.image ||
      Number(after.characterId) !== entry.characterId ||
      after.slug !== entry.slug ||
      after.visible !== true
    )
      throw new Error(`Read-back mismatch for ${entry.id}`);
    completed.push({ id: entry.id, status: "applied-and-read-back" });
  }
  const publicResponse = await fetch(`${origin}/api/wiki/variants`, {
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!publicResponse.ok) throw new Error(`Public verification failed (${publicResponse.status})`);
  const publicData = (await publicResponse.json()) as { variants?: Record<string, unknown>[] };
  for (const entry of entries)
    if (
      !publicData.variants?.some(
        (row) => row.id === entry.id && row.slug === entry.slug && row.image === entry.image,
      )
    )
      throw new Error(`Public projection not yet verified for ${entry.id}`);
  return completed;
}

if (import.meta.main) {
  const manifestPath = process.argv[2];
  if (!manifestPath || manifestPath.startsWith("--"))
    throw new Error(
      "Usage: bun assign-character-variant-images.ts <reviewed-manifest.json> [--apply]",
    );
  const manifest = (await Bun.file(manifestPath).json()) as { entries: VariantImageEntry[] };
  if (
    !Array.isArray(manifest.entries) ||
    manifest.entries.length < 1 ||
    manifest.entries.length > 100 ||
    new Set(manifest.entries.map((entry) => entry.id)).size !== manifest.entries.length
  )
    throw new Error("Invalid bounded manifest");
  console.log(
    JSON.stringify(
      await assignVariantImages(
        manifest.entries,
        process.env.SHENRON_WIKI_ADMIN_COOKIE,
        process.argv.includes("--apply"),
        process.env.SHENRON_ADMIN_TOKEN,
      ),
      null,
      2,
    ),
  );
}
