import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * On-the-fly episode resolution runs `scripts/resolve-episode.ts` of the BXC checkout
 * (`BXC_DIR`, default `~/bxc`). The production container has no such checkout: spawning there
 * failed on every request and the cause was swallowed. Locate the script once; when it is
 * absent, resolution is disabled with a single explicit line instead of one failure per play.
 */

export const EPISODE_RESOLVER_SCRIPT = "scripts/resolve-episode.ts";

export type EpisodeResolver = { dir: string; script: string };

type Locator = {
  env?: Record<string, string | undefined>;
  home?: string;
  exists?: (path: string) => boolean;
};

/** The BXC directory and script, or the reason why on-the-fly resolution is unavailable. */
export function locateEpisodeResolver({
  env = process.env,
  home = homedir(),
  exists = existsSync,
}: Locator = {}): { resolver: EpisodeResolver } | { missing: string; dir: string } {
  const dir = env.BXC_DIR || join(home, "bxc");
  if (!exists(dir)) return { missing: "BXC_DIR directory absent", dir };
  if (!exists(join(dir, EPISODE_RESOLVER_SCRIPT))) {
    return { missing: `${EPISODE_RESOLVER_SCRIPT} absent`, dir };
  }
  return { resolver: { dir, script: EPISODE_RESOLVER_SCRIPT } };
}

const decisions = new Map<string, EpisodeResolver | null>();

/**
 * Memoised per directory. Returns `null` (after logging once) when the script is not there,
 * so callers answer "stream unavailable" without spawning anything.
 */
export function episodeResolver(
  locator: Locator = {},
  log: (message: string) => void = (message) => console.error(message),
): EpisodeResolver | null {
  const found = locateEpisodeResolver(locator);
  const key = "resolver" in found ? found.resolver.dir : found.dir;
  if (decisions.has(key)) return decisions.get(key) ?? null;
  const resolver = "resolver" in found ? found.resolver : null;
  decisions.set(key, resolver);
  if (!resolver && "missing" in found) {
    log(`[HLS] on-the-fly episode resolution disabled: ${found.missing} (BXC_DIR=${found.dir})`);
  }
  return resolver;
}

/** Test hook: forgets the memoised decisions. */
export function resetEpisodeResolver(): void {
  decisions.clear();
}

/** One line for an error caught around a spawn: its class and message, never its payload. */
export function describeSpawnError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`.slice(0, 240);
  return String(err).slice(0, 240);
}
