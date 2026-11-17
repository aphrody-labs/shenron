// SPDX-License-Identifier: Apache-2.0
import { inspectXv2Animations, type Xv2AnimationInfo } from "@aphrody/shenron-engine/glb-scene";
import { characterCode, fetchCharacter } from "../../app/games/dragon-pixel/cpk-scene";

/** Exact names observed in the original GOK.ean on 2026-10-26, not naming heuristics. */
const VERIFIED_MOTIONS: Readonly<
  Record<string, { idleName: string; walkName: string; source: string }>
> = {
  GOK: { idleName: "GOK_BAS_STAND", walkName: "GOK_BAS_WALK", source: "data/chara/GOK/GOK.ean" },
};

export interface WorldCharacterMotion {
  idleName: string;
  walkName: string;
  source: string;
}

/** A different character requires an explicit selection from its inspected native EAN list. */
export function verifiedWorldMotion(
  code: string,
  animations: readonly Xv2AnimationInfo[],
): WorldCharacterMotion | null {
  const profile = Object.hasOwn(VERIFIED_MOTIONS, code) ? VERIFIED_MOTIONS[code]! : null;
  if (!profile) return null;
  for (const name of [profile.idleName, profile.walkName]) {
    if (
      animations.filter((animation) => animation.name === name && animation.frameCount > 0)
        .length !== 1
    )
      throw new Error("Original character motion differs from the verified EAN");
  }
  return { ...profile };
}

/** Bounded CPK loader plus native EAN inspection; no second renderer or GPU is created. */
export async function loadWorldCharacter(input: string, signal: AbortSignal) {
  const code = characterCode(input);
  if (!code) throw new Error("Invalid character code");
  const files = await fetchCharacter(code, signal);
  signal.throwIfAborted();
  if (!files) return null;
  const animations = await inspectXv2Animations(files.ean);
  signal.throwIfAborted();
  return { code, files, animations, motion: verifiedWorldMotion(code, animations) };
}
