// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import { WikiUpdatePreconditionError, WikiUpdateRequestError } from "./wiki-update-precondition";

type Row = Record<string, unknown>;
/**
 * Keys isolated from measured evidence. `imageArtwork` is legacy-only: preserve it long enough to
 * keep old generated assets display-blocked and allow an atomic removal, while the strict metadata
 * schema below rejects it on every new edit.
 */
export const VARIANT_EDITORIAL_EVIDENCE_KEYS = ["imageArtwork", "editorialReferences"] as const;
const EDITORIAL_KEYS = new Set<string>(VARIANT_EDITORIAL_EVIDENCE_KEYS);
const REFERENCE_FIELDS = [
  "label",
  "displayName",
  "nameJa",
  "form",
  "image",
  "age",
  "powerLevel",
  "ki",
  "maxKi",
  "role",
  "affiliation",
  "summary",
  "highlights",
  "transformationIds",
  "techniqueIds",
  "firstVolume",
  "lastVolume",
  "visible",
] as const;
const PRIMARY_HOSTS = new Set([
  "dragonballfr.com",
  "dragon-ball-official.com",
  "www.dragon-ball-official.com",
  "en.dragon-ball-official.com",
  "fr.dragon-ball-official.com",
  "jp.dragon-ball-official.com",
  "shonenjump.com",
  "www.shonenjump.com",
  "shueisha.co.jp",
  "www.shueisha.co.jp",
  "vjump.shueisha.co.jp",
  "toei-anim.co.jp",
  "www.toei-anim.co.jp",
  "lineup.toei-anim.co.jp",
  "toei-animation.com",
  "www.toei-animation.com",
]);

function safeHttps(value: string): URL | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.href !== value ||
      /(?:^|\.)fandom\.com$/i.test(url.hostname)
    )
      return null;
    for (const key of url.searchParams.keys())
      if (/token|secret|auth|password|signature|credential|api.?key/i.test(key)) return null;
    return url;
  } catch {
    return null;
  }
}
function primaryReference(value: string): boolean {
  const url = safeHttps(value);
  if (!url || !PRIMARY_HOSTS.has(url.hostname)) return false;
  return (
    url.hostname !== "dragonballfr.com" ||
    /^\/wiki\/(?:manga|databooks|episodes)(?:\/|$)/.test(url.pathname)
  );
}
function primaryImage(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const url = safeHttps(value);
  return (
    !!url &&
    ((url.hostname === "cdn.dragonballfr.com" &&
      (/^\/assets\/(?:manga|dbz\/officiel-|wiki\/episodes\/)/.test(url.pathname) ||
        /^\/assets\/wiki\/variants\/(?:manga|anime)-[a-f0-9]{64}\.jpg$/i.test(url.pathname))) ||
      (PRIMARY_HOSTS.has(url.hostname) && url.hostname !== "dragonballfr.com"))
  );
}
function generatedNamespace(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value, "https://dragonballfr.com");
    return (
      ["dragonballfr.com", "cdn.dragonballfr.com"].includes(url.hostname) &&
      /^\/assets\/wiki\/generated-portraits(?:\/|$)/i.test(decodeURIComponent(url.pathname))
    );
  } catch {
    return false;
  }
}
const boundedText = (max: number) => z.string().trim().min(1).max(max);
const reference = z
  .object({
    fields: z
      .array(z.enum(REFERENCE_FIELDS))
      .min(1)
      .max(REFERENCE_FIELDS.length)
      .refine((fields) => new Set(fields).size === fields.length),
    url: z.string().max(2048).refine(primaryReference),
    title: boundedText(300),
    locator: boundedText(1000),
  })
  .strict();
const metadata = z
  .object({
    editorialReferences: z.array(reference).max(64).optional(),
  })
  .strict();
function record(value: unknown): value is Row {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}
function fail(message: string): never {
  throw new WikiUpdateRequestError(message);
}

/** Validate the locked current row, never an untrusted HTTP expected snapshot. */
export function assertVariantEvidenceUpdate(before: Row, patch: Row): void {
  const writesEvidence = Object.hasOwn(patch, "evidence");
  const current = before.evidence;
  const next = writesEvidence ? patch.evidence : current;
  const image = Object.hasOwn(patch, "image") ? patch.image : before.image;
  const imageChanged = Object.hasOwn(patch, "image") && !Bun.deepEquals(image, before.image);
  if (!writesEvidence) {
    if (record(current) && record(current.imageArtwork)) {
      if (current.imageArtwork.image !== image)
        fail("Existing generated image and provenance must be removed together");
    }
    if (imageChanged) fail("Variant image changes require a primary source reference");
    if (generatedNamespace(image)) fail("Generated images are not accepted");
    return;
  }
  if (current === null && next === null) {
    if (imageChanged) fail("Variant image changes require a primary source reference");
    if (generatedNamespace(image)) fail("Generated images are not accepted");
    return;
  }
  if (!record(current) || !record(next))
    fail("Existing complete variant evidence must be retained");
  if (JSON.stringify(next).length > 128 * 1024 || Object.keys(next).length > 64)
    fail("Variant evidence exceeds its bounds");
  for (const key of new Set([...Object.keys(current), ...Object.keys(next)])) {
    if (EDITORIAL_KEYS.has(key)) continue;
    if (
      !Object.hasOwn(current, key) ||
      !Object.hasOwn(next, key) ||
      !Bun.deepEquals(current[key], next[key])
    )
      fail(`Measured variant evidence cannot change: ${key}`);
  }
  const editorial = Object.fromEntries(
    Object.entries(next).filter(([key]) => EDITORIAL_KEYS.has(key)),
  );
  const parsed = metadata.safeParse(editorial);
  if (!parsed.success)
    fail("Invalid primary references; generated artwork provenance is unsupported");
  if (generatedNamespace(image)) fail("Generated images are not accepted");
  if (imageChanged && image !== null) {
    const imageReference = parsed.data.editorialReferences?.find((item) =>
      item.fields.includes("image"),
    );
    if (!primaryImage(image) || !imageReference)
      fail("Variant image changes require a primary source image and reference");
    const url = safeHttps(image)!;
    const contentHash =
      url.hostname === "cdn.dragonballfr.com"
        ? /^\/assets\/wiki\/variants\/(?:manga|anime)-([a-f0-9]{64})\.jpg$/i.exec(url.pathname)?.[1]
        : undefined;
    if (contentHash && !imageReference.locator.toLowerCase().includes(contentHash.toLowerCase()))
      fail("Published source image hash must match its editorial locator");
  }
}

/** Restore only an audited editorial delta, preserving independent producer updates. */
export function variantRevisionRestore(before: Row, after: Row, current: Row): Row {
  if (!Bun.deepEquals(before.keyEpisodes, after.keyEpisodes))
    fail("Variant keyEpisodes historical changes cannot be restored by the editorial writer");
  const patch: Row = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (key === "keyEpisodes" || Bun.deepEquals(before[key], after[key])) continue;
    if (key !== "evidence") {
      if (!Bun.deepEquals(current[key], after[key])) throw new WikiUpdatePreconditionError();
      patch[key] = Object.hasOwn(before, key) ? before[key] : null;
      continue;
    }
    const oldEvidence = before.evidence;
    const writtenEvidence = after.evidence;
    const currentEvidence = current.evidence;
    if (!record(oldEvidence) || !record(writtenEvidence) || !record(currentEvidence))
      fail("Variant measurement history cannot be rewritten by an editorial rollback");
    for (const field of new Set([...Object.keys(oldEvidence), ...Object.keys(writtenEvidence)])) {
      if (!EDITORIAL_KEYS.has(field) && !Bun.deepEquals(oldEvidence[field], writtenEvidence[field]))
        fail(`Measured variant evidence cannot be restored by the editorial writer: ${field}`);
    }
    const evidence = { ...currentEvidence };
    for (const field of EDITORIAL_KEYS) {
      // An editorial rollback must never resurrect an image generated by the retired pipeline.
      if (field === "imageArtwork") continue;
      if (Bun.deepEquals(oldEvidence[field], writtenEvidence[field])) continue;
      if (!Bun.deepEquals(currentEvidence[field], writtenEvidence[field]))
        throw new WikiUpdatePreconditionError();
      if (Object.hasOwn(oldEvidence, field)) evidence[field] = oldEvidence[field];
      else delete evidence[field];
    }
    patch.evidence = evidence;
  }
  return patch;
}
