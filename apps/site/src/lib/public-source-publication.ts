// SPDX-License-Identifier: Apache-2.0
import "server-only";
import { DEFAULT_PUBLIC_ORIGINS } from "@aphrody/shenron-config/public-urls";

export type PublicationObject = { path: string; sha256: string; size: number; mime?: string };
export type PublicationDocument = {
  sourceUrl: string;
  title: string;
  body: PublicationObject;
  media: PublicationObject[];
  children: string[];
};
export type SourcePublication = {
  schema: "shenron-source-publication/v1";
  sourceUrl: string;
  targetUrl: string;
  publishedAt: string;
  title: string;
  documents: PublicationDocument[];
};
export const publicationSlug = (slug: string): boolean =>
  slug.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
const publicUrl = (value: unknown): value is string => {
  if (
    typeof value !== "string" ||
    value.length > 8192 ||
    [...value].some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)
  )
    return false;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
};
function object(value: unknown, slug: string, body = false): value is PublicationObject {
  if (!value || typeof value !== "object") return false;
  const item = value as PublicationObject;
  return (
    typeof item.path === "string" &&
    typeof item.sha256 === "string" &&
    /^[a-f0-9]{64}$/.test(item.sha256) &&
    item.path ===
      `/publications/${slug}/objects/${item.sha256}.${body ? "md" : item.path?.split(".").at(-1)}` &&
    /^[a-z0-9]+$/.test(item.path.split(".").at(-1) ?? "") &&
    Number.isSafeInteger(item.size) &&
    item.size >= 0 &&
    item.size <= (body ? 1024 * 1024 : 33 * 1024 * 1024) &&
    (body ||
      (typeof item.mime === "string" && /^(?:image|audio|video)\/[a-z0-9.+-]+$/i.test(item.mime)))
  );
}
export function validateSourcePublication(value: unknown, slug: string): SourcePublication {
  const item = value as SourcePublication;
  if (
    !publicationSlug(slug) ||
    !item ||
    item.schema !== "shenron-source-publication/v1" ||
    !publicUrl(item.sourceUrl) ||
    item.targetUrl !== `${DEFAULT_PUBLIC_ORIGINS.site}/publications/${slug}` ||
    !Number.isFinite(Date.parse(item.publishedAt)) ||
    typeof item.title !== "string" ||
    item.title.length > 1000 ||
    !Array.isArray(item.documents) ||
    !item.documents.length ||
    item.documents.length > 256
  )
    throw new Error("Invalid public source publication");
  const urls = new Set<string>();
  for (const doc of item.documents) {
    if (
      !doc ||
      !publicUrl(doc.sourceUrl) ||
      urls.has(doc.sourceUrl) ||
      typeof doc.title !== "string" ||
      doc.title.length > 1000 ||
      !object(doc.body, slug, true) ||
      !Array.isArray(doc.media) ||
      doc.media.length > 256 ||
      !doc.media.every((entry) => object(entry, slug)) ||
      !Array.isArray(doc.children) ||
      doc.children.length > 256 ||
      !doc.children.every(publicUrl)
    )
      throw new Error("Invalid publication document");
    urls.add(doc.sourceUrl);
  }
  if (
    !urls.has(item.sourceUrl) ||
    item.documents.some((doc) => doc.children.some((url) => !urls.has(url)))
  )
    throw new Error("Incomplete publication graph");
  return item;
}
async function readBytes(path: string, limit: number): Promise<Uint8Array | null> {
  const response = await fetch(new URL(path, DEFAULT_PUBLIC_ORIGINS.cdn), {
    cache: "no-store",
    redirect: "error",
    credentials: "omit",
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 404) {
    await response.body?.cancel();
    return null;
  }
  if (!response.ok || !response.body) throw new Error("Publication CDN unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    if (Number(response.headers.get("content-length")) > limit)
      throw new Error("Publication too large");
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new Error("Publication too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let position = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, position);
    position += chunk.length;
  }
  return bytes;
}
export async function readSourcePublication(slug: string): Promise<SourcePublication | null> {
  if (!publicationSlug(slug)) return null;
  const bytes = await readBytes(`/publications/${slug}/index.json`, 2 * 1024 * 1024);
  return bytes
    ? validateSourcePublication(
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
        slug,
      )
    : null;
}
export async function readPublicationBody(doc: PublicationDocument): Promise<string> {
  const bytes = await readBytes(doc.body.path, 1024 * 1024);
  if (!bytes || bytes.length !== doc.body.size) throw new Error("Publication body size differs");
  const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
  const hex = [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (hex !== doc.body.sha256) throw new Error("Publication body integrity differs");
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
export function publicationDocumentHref(slug: string, sourceUrl: string): string {
  return `/publications/${slug}?source=${Buffer.from(sourceUrl).toString("base64url")}`;
}
