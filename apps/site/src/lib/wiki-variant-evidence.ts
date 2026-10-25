// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import { WikiUpdatePreconditionError, WikiUpdateRequestError } from "./wiki-update-precondition";

type Row = Record<string, unknown>;
const EDITORIAL_KEYS = new Set(["imageArtwork", "editorialReferences"]);
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
function primaryImage(value: string): boolean {
  const url = safeHttps(value);
  return (
    !!url &&
    ((url.hostname === "cdn.dragonballfr.com" &&
      /^\/assets\/(?:manga|dbz\/officiel-|wiki\/episodes\/)/.test(url.pathname)) ||
      (PRIMARY_HOSTS.has(url.hostname) && url.hostname !== "dragonballfr.com"))
  );
}
function generatedImage(value: string): boolean {
  let path = value;
  if (value.startsWith("https://")) {
    const url = safeHttps(value);
    if (!url || url.hostname !== "cdn.dragonballfr.com" || url.search || url.hash) return false;
    path = url.pathname;
  }
  return (
    /^(?:\.\/|\/)?assets\/wiki\/generated-portraits\/[a-z0-9][a-z0-9._/-]*\.(?:png|webp|avif|jpe?g)$/i.test(
      path,
    ) &&
    !path
      .split("/")
      .slice(path.startsWith("./") ? 1 : 0)
      .some((part) => part === ".." || part === ".") &&
    !path.includes("//")
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
const artwork = z
  .object({
    kind: z.literal("generated"),
    image: z.string().max(2048).refine(generatedImage),
    referenceUrl: z.string().max(2048).refine(primaryReference),
    referenceImageUrl: z.string().max(2048).refine(primaryImage),
    referenceTitle: boundedText(300),
    referenceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    outputSha256: z.string().regex(/^[a-f0-9]{64}$/),
    generatedAt: z.string().max(40).datetime({ offset: true }),
    generator: z.literal("image_gen"),
  })
  .strict();
const metadata = z
  .object({
    imageArtwork: artwork.optional(),
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
  if (!writesEvidence) {
    if (record(current) && record(current.imageArtwork)) {
      if (current.imageArtwork.image !== image)
        fail("Generated artwork provenance must match the resulting image");
    } else if (generatedNamespace(image)) fail("Generated artwork requires its provenance");
    return;
  }
  if (current === null && next === null) {
    if (generatedNamespace(image)) fail("Generated artwork requires its provenance");
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
  if (!parsed.success) fail("Invalid primary references or generated artwork provenance");
  if (parsed.data.imageArtwork) {
    if (parsed.data.imageArtwork.image !== image)
      fail("Generated artwork provenance must match the resulting image");
  } else if (generatedNamespace(image)) fail("Generated artwork requires its provenance");
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
