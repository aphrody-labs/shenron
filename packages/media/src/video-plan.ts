// SPDX-License-Identifier: Apache-2.0
import { sha256Hex } from "./sha256";

export interface VideoRequest {
  kind: "chronology" | "beerus" | "original";
  language: "fr" | "en" | "ja";
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  maxCards: number;
}
export interface VideoCard {
  title: string;
  subtitle?: string;
  href?: string;
  date?: string;
  provenance: string;
}
export interface VideoSource {
  url: string;
  sha256: string;
  fetchedAt: string;
}
export interface VideoSnapshot {
  cards: VideoCard[];
  sources: VideoSource[];
  labels: { title: string; subtitle: string; dateLabel: string };
}
export function parseVideoRequest(input: unknown): VideoRequest {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new TypeError("Request must be an object");
  const value = input as Record<string, unknown>;
  const allowed = new Set([
    "kind",
    "language",
    "width",
    "height",
    "fps",
    "durationSeconds",
    "maxCards",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key)))
    throw new TypeError("Unknown request field");
  const kind = value.kind ?? "chronology";
  const language = value.language ?? "fr";
  if (
    typeof kind !== "string" ||
    typeof language !== "string" ||
    !["chronology", "beerus", "original"].includes(String(kind)) ||
    !["fr", "en", "ja"].includes(String(language))
  )
    throw new TypeError("Invalid kind or language");
  const integer = (key: string, fallback: number, min: number, max: number) => {
    const n = value[key] ?? fallback;
    if (typeof n !== "number" || !Number.isSafeInteger(n) || n < min || n > max)
      throw new RangeError(`Invalid ${key}`);
    return n;
  };
  const request = {
    kind,
    language,
    width: integer("width", 1280, 320, 1920),
    height: integer("height", 720, 320, 1920),
    fps: integer("fps", 24, 1, 60),
    durationSeconds: integer("durationSeconds", 12, 1, 30),
    maxCards: integer("maxCards", 6, 1, 12),
  } as VideoRequest;
  if (request.width % 2 || request.height % 2 || request.width * request.height > 2073600)
    throw new RangeError("Invalid resolution");
  return request;
}
export function buildVideoPlan(input: unknown, snapshot: VideoSnapshot) {
  const request = parseVideoRequest(input);
  const cards = snapshot.cards.slice(0, request.maxCards);
  if (!cards.length) throw new Error("No verified content available");
  const contentHash = sha256Hex(
    JSON.stringify({
      request,
      cards,
      sources: snapshot.sources.map(({ url, sha256 }) => ({ url, sha256 })),
      labels: snapshot.labels,
    }),
  );
  return {
    schema: "shenron.video/v1" as const,
    request,
    render: {
      kind: "react-ssr" as const,
      composition: {
        chronology: "ShenronChronology",
        beerus: "ShenronBeerus",
        original: "ShenronOriginal",
      }[request.kind],
      fps: { num: request.fps, den: 1 },
      startFrame: 0,
      endFrame: request.fps * request.durationSeconds,
      width: request.width,
      height: request.height,
      workers: 1,
    },
    cards,
    sources: snapshot.sources,
    labels: snapshot.labels,
    contentHash,
    qualification: { originalArtwork: true, pixelMatchVerified: false, rendered: false },
  };
}
export type VideoPlan = ReturnType<typeof buildVideoPlan>;
