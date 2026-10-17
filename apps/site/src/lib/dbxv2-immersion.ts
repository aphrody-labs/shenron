import "server-only";
/**
 * Optional private immersion for the owner: named slots (a hit sound, a texture, a clip…) mapped
 * to game resources by an owner-written file that lives under `var/` (ignored by Git, never
 * shipped). The map holds references only, no game bytes. A private page asks
 * `loadImmersionPack()` for signed, short-lived URLs of the slots it knows; without the gate, an
 * admin session or the file, the pack is empty and the page behaves exactly as the public one.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { dbxv2SiteGate } from "@/lib/dbxv2-gate";
import { getDbxv2Service, type PreviewKind } from "@/lib/dbxv2";

const SlotSchema = z.object({
  ref: z.string().min(3).max(512),
  kind: z.enum(["png", "wav", "video", "model.glb"]),
  index: z.number().int().min(0).max(255).optional(),
  cue: z.number().int().min(0).max(65535).optional(),
});

export const ImmersionMapSchema = z.object({
  slots: z.record(z.string().regex(/^[a-z][a-z0-9-]{0,47}$/), SlotSchema),
});
export type ImmersionMap = z.infer<typeof ImmersionMapSchema>;

export interface ImmersionSlot {
  kind: PreviewKind;
  url: string;
}
export type ImmersionPack = Readonly<Record<string, ImmersionSlot>>;

export const DEFAULT_IMMERSION_MAP = "var/dbxv2/immersion.json";

/** Reads and validates the owner's map; null when absent or malformed. */
export async function readImmersionMap(
  path = process.env.DBXV2_IMMERSION_MAP?.trim() || DEFAULT_IMMERSION_MAP,
): Promise<ImmersionMap | null> {
  try {
    const text = await readFile(resolve(process.cwd(), "../..", path), "utf8").catch(() =>
      readFile(resolve(process.cwd(), path), "utf8"),
    );
    const parsed = ImmersionMapSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Signed URLs of the requested slots. The caller MUST already have run `requireAdmin()`; the pack
 * stays empty when the gate is closed, so a public render can never obtain anything.
 */
export async function loadImmersionPack(wanted?: readonly string[]): Promise<ImmersionPack> {
  if (!dbxv2SiteGate().enabled) return {};
  const map = await readImmersionMap();
  if (!map) return {};
  let service;
  try {
    service = await getDbxv2Service();
  } catch {
    return {};
  }
  const pack: Record<string, ImmersionSlot> = {};
  for (const [name, slot] of Object.entries(map.slots)) {
    if (wanted && !wanted.includes(name)) continue;
    try {
      const signed = service.preview({
        ref: slot.ref,
        kind: slot.kind,
        index: slot.index,
        cue: slot.cue,
      });
      pack[name] = { kind: signed.kind, url: signed.url };
    } catch {
      /* an invalid reference leaves its slot out */
    }
  }
  return pack;
}
