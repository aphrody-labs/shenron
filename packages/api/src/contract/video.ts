// SPDX-License-Identifier: Apache-2.0
import { officialCrunchyrollWatchURL } from "@aphrody/shenron-config/video-providers";
import { z } from "zod";

const CrunchyrollObservation = z.object({
  provider: z.literal("crunchyroll"),
  available: z.boolean(),
  url: z.string(),
  checkedAt: z.number().finite().positive(),
  langs: z.array(z.enum(["vf", "vostfr", "vost"])).optional(),
});

export type OfficialCrunchyrollWatchOffer = {
  readonly url: string;
  readonly checkedAt: number;
  readonly languages: readonly ("vf" | "vostfr" | "vost")[];
};

/** Latest observation wins, including a later withdrawal or an unsafe URL. */
export function latestOfficialCrunchyrollWatchOffer(
  raw: unknown,
): OfficialCrunchyrollWatchOffer | null {
  if (!Array.isArray(raw)) return null;
  let latest: z.infer<typeof CrunchyrollObservation> | null = null;
  for (const item of raw) {
    const parsed = CrunchyrollObservation.safeParse(item);
    if (!parsed.success) continue;
    if (!latest || parsed.data.checkedAt >= latest.checkedAt) latest = parsed.data;
  }
  if (!latest?.available) return null;
  const url = officialCrunchyrollWatchURL(latest.url);
  return url ? { url, checkedAt: latest.checkedAt, languages: latest.langs ?? [] } : null;
}
