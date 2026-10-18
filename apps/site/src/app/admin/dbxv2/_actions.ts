/* oxlint-disable oxc/no-map-spread -- reviewed: admin-only private tooling, behavior preserved */
"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import {
  Dbxv2SiteError,
  getDbxv2Service,
  previewKindOf,
  type Dbxv2FailureCode,
  type Dbxv2FileLike,
  type Dbxv2HitLike,
  type PreviewKind,
} from "@/lib/dbxv2";

/** Every action re-checks the admin session (server actions are public endpoints) and the gate. */
export type ActionResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: Dbxv2FailureCode };

async function run<T>(
  work: (service: Awaited<ReturnType<typeof getDbxv2Service>>) => Promise<T> | T,
) {
  await requireAdmin();
  try {
    return { ok: true, data: await work(await getDbxv2Service()) } as const;
  } catch (error) {
    // Only a stable code leaves the server: messages could carry paths or addresses.
    return { ok: false, error: error instanceof Dbxv2SiteError ? error.code : "failed" } as const;
  }
}

const SearchInput = z.object({
  q: z.string().min(2).max(200),
  lang: z.enum(["fr", "en", "ja"]).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export async function searchDbxv2(
  input: unknown,
): Promise<ActionResult<{ mode: string; hits: Dbxv2HitLike[] }>> {
  const parsed = SearchInput.safeParse(input);
  if (!parsed.success) {
    await requireAdmin();
    return { ok: false, error: "invalid" };
  }
  return run((service) => service.search(parsed.data));
}

const FilesInput = z.object({
  q: z.string().max(200).optional(),
  format: z.string().max(16).optional(),
  cpk: z.string().max(64).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).max(1_000_000).optional(),
});

export interface FileRow extends Dbxv2FileLike {
  previewKind: PreviewKind | null;
}

export async function listDbxv2Files(input: unknown): Promise<ActionResult<FileRow[]>> {
  const parsed = FilesInput.safeParse(input);
  if (!parsed.success) {
    await requireAdmin();
    return { ok: false, error: "invalid" };
  }
  return run((service) =>
    service
      .files(parsed.data)
      .map((file) => ({ ...file, previewKind: previewKindOf(file.format) })),
  );
}

export async function readDbxv2Messages(
  nameId: unknown,
): Promise<ActionResult<{ lang: string; text: string }[]>> {
  const parsed = z.string().min(1).max(200).safeParse(nameId);
  if (!parsed.success) {
    await requireAdmin();
    return { ok: false, error: "invalid" };
  }
  return run((service) => service.messages(parsed.data));
}

const PreviewInput = z.object({
  ref: z.string().min(3).max(512),
  kind: z.enum(["png", "wav", "video", "model.glb"]),
  index: z.number().int().min(0).max(255).optional(),
  cue: z.number().int().min(0).max(65535).optional(),
});

export async function previewDbxv2(
  input: unknown,
): Promise<ActionResult<{ kind: PreviewKind; url: string; expiresInSeconds: number }>> {
  const parsed = PreviewInput.safeParse(input);
  if (!parsed.success) {
    await requireAdmin();
    return { ok: false, error: "invalid" };
  }
  return run((service) => service.preview(parsed.data));
}
