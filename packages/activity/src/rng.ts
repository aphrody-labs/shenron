// SPDX-License-Identifier: Apache-2.0
/**
 * Injectable randomness: a function returning a float in [0, 1). Production uses `secureRng`
 * (Web Crypto), tests and the "quiz of the day" use `seededRng` so that the same seed gives the same
 * questions in the same order. Nothing in this package calls `Math.random`.
 */
export type Rng = () => number;

/** xmur3 string hash, used to turn any seed into 32 bits of state. */
function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Deterministic generator (mulberry32) from a string or number seed. */
export function seededRng(seed: string | number): Rng {
  let state = hashSeed(String(seed));
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cryptographically strong generator (Web Crypto), for production sessions. */
export function secureRng(): Rng {
  const buffer = new Uint32Array(1);
  return () => {
    crypto.getRandomValues(buffer);
    return (buffer[0] as number) / 4294967296;
  };
}

/** Uniform integer in [0, maxExclusive). */
export function randomInt(rng: Rng, maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1)
    throw new RangeError("maxExclusive must be a positive integer");
  return Math.min(maxExclusive - 1, Math.floor(rng() * maxExclusive));
}

/** Fisher-Yates shuffle of a copy. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return out;
}
