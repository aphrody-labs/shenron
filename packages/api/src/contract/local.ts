// SPDX-License-Identifier: Apache-2.0
/**
 * Local health of the autonomous Shenron server (`shenron-server`, desktop sidecar):
 * `GET /api/local/health`, answered before the front app on the same origin. Outside the
 * public OpenAPI document (a local route, never proxied by the site). `groups` says which API
 * groups of this contract the server answers right now; a missing capability (no VFS, no chat
 * model, no `aphrody` for the OCR, no `shenron-mcp`) is `available: false` with a short French
 * `reason`, never an internal path or a secret.
 *
 * Runtime class: `pure`.
 */
import { z } from "zod";

export const LOCAL_HEALTH_PATH = "/api/local/health";

/** API groups reported by the local health, in display order. */
export const LOCAL_API_GROUPS = [
  "wiki",
  "rag",
  "chat",
  "conversations",
  "sync",
  "vfs",
  "ocr",
  "mcp",
  "models",
  "memory",
  "auth",
] as const;

export const LocalApiGroupName = z.enum(LOCAL_API_GROUPS);
export type LocalApiGroupName = z.infer<typeof LocalApiGroupName>;

/** `reason` is present only when the group is unavailable. */
export const LocalApiGroupStatus = z.object({
  available: z.boolean(),
  reason: z.string().max(200).optional(),
});
export type LocalApiGroupStatus = z.infer<typeof LocalApiGroupStatus>;

/** Every group, always present (zod v4 enum records are exhaustive). */
export const LocalApiGroups = z.record(LocalApiGroupName, LocalApiGroupStatus);
export type LocalApiGroups = z.infer<typeof LocalApiGroups>;

const apiGroupShape = Object.fromEntries(
  LOCAL_API_GROUPS.map((name) => [name, LocalApiGroupStatus]),
) as Record<LocalApiGroupName, typeof LocalApiGroupStatus>;

/**
 * The API groups, plus the groups the server answers itself: `koharu`, the manga translation
 * editor engine of `/api/local/koharu` (a `koharu-sdk` child; absent from servers without it).
 */
export const LocalHealthGroups = z.object({
  ...apiGroupShape,
  koharu: LocalApiGroupStatus.optional(),
});
export type LocalHealthGroups = z.infer<typeof LocalHealthGroups>;

export const LocalHealthResponse = z.object({
  /** The front app (Next) answers; the API groups may answer before it. */
  ok: z.boolean(),
  service: z.literal("shenron-server"),
  version: z.string(),
  profile: z.enum(["production", "desktop", "public"]),
  home: z.string(),
  /** Native local search (`/api/local/rag/search`, shenron-ffi). */
  localRag: z.boolean(),
  localRagError: z.string().optional(),
  site: z.boolean().optional(),
  buildId: z.string().optional(),
  groups: LocalHealthGroups,
});
export type LocalHealthResponse = z.infer<typeof LocalHealthResponse>;
