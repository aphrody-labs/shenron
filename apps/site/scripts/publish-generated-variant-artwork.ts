#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { assetUrl } from "../src/lib/assets";
import { wikiUpdateSnapshotHash } from "../src/lib/wiki-update-precondition";
import { DEFAULT_PUBLIC_ORIGINS } from "@aphrody/shenron-config/public-urls";

export type GeneratedVariantArtwork = {
  id: number;
  characterId: number;
  slug: string;
  file: string;
  sha256: string;
  generatedAt: string;
  reference: { url: string; imageUrl: string; title: string; sha256: string };
};
const hashPattern = /^[a-f0-9]{64}$/;
const uploadPattern = /^\.\/assets\/wiki\/generated-portraits\/[a-zA-Z0-9_-]+\.(png|webp)$/;
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Keep measured OCR fields intact; never let an illustration become documentary evidence. */
export function prepareGeneratedArtworkUpdate(
  entry: GeneratedVariantArtwork,
  row: Record<string, unknown>,
  uploadedPath: string,
) {
  if (
    !Number.isSafeInteger(entry.id) ||
    entry.id < 1 ||
    !Number.isSafeInteger(entry.characterId) ||
    entry.characterId < 1 ||
    Number(row.id) !== entry.id ||
    Number(row.characterId) !== entry.characterId ||
    row.slug !== entry.slug ||
    row.visible !== true
  )
    throw new Error("Variant identity or visibility drifted");
  if (!uploadPattern.test(uploadedPath)) throw new Error("Invalid generated artwork upload path");
  if (
    !hashPattern.test(entry.sha256) ||
    !hashPattern.test(entry.reference.sha256) ||
    !Number.isFinite(Date.parse(entry.generatedAt))
  )
    throw new Error("Invalid artwork provenance");
  const source = new URL(entry.reference.url);
  const sourceImage = new URL(entry.reference.imageUrl);
  if (
    source.origin !== DEFAULT_PUBLIC_ORIGINS.site ||
    !source.pathname.startsWith("/wiki/manga/") ||
    sourceImage.origin !== "https://cdn.dragonballfr.com" ||
    !sourceImage.pathname.startsWith("/assets/manga/") ||
    source.username ||
    source.password ||
    sourceImage.username ||
    sourceImage.password ||
    !entry.reference.title.trim()
  )
    throw new Error("Unreviewed primary manga reference");
  if (!isObject(row.evidence)) throw new Error("Existing measured evidence required");
  const previousArtwork = row.evidence.imageArtwork;
  if (
    row.image === uploadedPath &&
    isObject(previousArtwork) &&
    previousArtwork.kind === "generated" &&
    previousArtwork.outputSha256 === entry.sha256
  )
    return null;
  if (row.image !== null) throw new Error("Existing editorial image must be preserved");
  return {
    image: uploadedPath,
    evidence: {
      ...row.evidence,
      imageArtwork: {
        kind: "generated",
        image: uploadedPath,
        referenceUrl: entry.reference.url,
        referenceImageUrl: entry.reference.imageUrl,
        referenceTitle: entry.reference.title,
        referenceSha256: entry.reference.sha256,
        outputSha256: entry.sha256,
        generatedAt: entry.generatedAt,
        generator: "image_gen",
      },
    },
    expected: row,
    expectedSha256: wikiUpdateSnapshotHash(row),
  };
}

/** Upload and edit only through the authenticated site APIs, with independent read-back. */
export async function publishGeneratedArtwork(entries: GeneratedVariantArtwork[], apply = false) {
  if (
    !Array.isArray(entries) ||
    entries.length < 1 ||
    entries.length > 30 ||
    new Set(entries.map((entry) => entry.id)).size !== entries.length
  )
    throw new Error("Invalid bounded manifest");
  if (!apply)
    return entries.map((entry) => ({
      id: entry.id,
      status: "proposal-not-executed",
      reference: entry.reference,
      sha256: entry.sha256,
    }));
  const token = process.env.SHENRON_ADMIN_TOKEN;
  if (!token) throw new Error("SHENRON_ADMIN_TOKEN is required");
  const site = DEFAULT_PUBLIC_ORIGINS.site;
  const auth = { authorization: `Bearer ${token}` };
  const planned = [];
  for (const entry of entries) {
    const response = await fetch(`${site}/api/wiki-admin/db_character_variants/${entry.id}`, {
      headers: auth,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(`Administrative read failed (${response.status}) for ${entry.id}`);
    const row = (await response.json()) as Record<string, unknown>;
    // A reserved valid path validates all preconditions before uploading any file.
    prepareGeneratedArtworkUpdate(entry, row, "./assets/wiki/generated-portraits/preflight.png");
    const bytes = await Bun.file(entry.file).bytes();
    if (
      bytes.length === 0 ||
      bytes.length > 20 * 1024 * 1024 ||
      new Bun.CryptoHasher("sha256").update(bytes).digest("hex") !== entry.sha256
    )
      throw new Error(`Generated image hash or size mismatch for ${entry.id}`);
    const primary = await fetch(entry.reference.imageUrl, {
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (
      !primary.ok ||
      new Bun.CryptoHasher("sha256").update(await primary.bytes()).digest("hex") !==
        entry.reference.sha256
    )
      throw new Error(`Primary reference changed for ${entry.id}`);
    planned.push({ entry, row, bytes });
  }
  const results = [];
  for (const { entry, row, bytes } of planned) {
    const form = new FormData();
    form.set("file", new File([bytes], `variant-${entry.id}.png`, { type: "image/png" }));
    form.set("subdir", "generated-portraits");
    const upload = await fetch(`${site}/api/admin/upload`, {
      method: "POST",
      headers: auth,
      body: form,
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
    if (!upload.ok)
      throw new Error(`Upload failed (${upload.status}) for ${entry.id}; no variant patch issued`);
    const uploaded = (await upload.json()) as { path?: string };
    if (typeof uploaded.path !== "string") throw new Error("Upload omitted its asset path");
    const body = prepareGeneratedArtworkUpdate(entry, row, uploaded.path);
    const imageResponse = await fetch(assetUrl(uploaded.path), {
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (
      !imageResponse.ok ||
      new Bun.CryptoHasher("sha256").update(await imageResponse.bytes()).digest("hex") !==
        entry.sha256
    )
      throw new Error(`Uploaded image failed independent hash check for ${entry.id}`);
    if (!body) continue;
    const url = `${site}/api/wiki-admin/db_character_variants/${entry.id}`;
    const patch = await fetch(url, {
      method: "PATCH",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!patch.ok)
      throw new Error(
        `Variant patch failed (${patch.status}) for ${entry.id}; uploaded asset remains unassigned`,
      );
    const reread = await fetch(url, {
      headers: auth,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!reread.ok) throw new Error(`Read-back failed (${reread.status}) for ${entry.id}`);
    const after = (await reread.json()) as Record<string, unknown>;
    if (after.image !== body.image || !Bun.deepEquals(after.evidence, body.evidence))
      throw new Error(`Artwork provenance read-back mismatch for ${entry.id}`);
    results.push({ id: entry.id, image: after.image, status: "applied-and-read-back" });
  }
  return results;
}

if (import.meta.main) {
  const path = process.argv[2];
  if (!path || path.startsWith("--"))
    throw new Error(
      "Usage: bun publish-generated-variant-artwork.ts <reviewed-manifest.json> [--apply]",
    );
  const manifest = (await Bun.file(path).json()) as { entries: GeneratedVariantArtwork[] };
  console.log(
    JSON.stringify(
      await publishGeneratedArtwork(manifest.entries, process.argv.includes("--apply")),
      null,
      2,
    ),
  );
}
