/** This Bun; a compiled program hosting the runner falls back to the `bun` on PATH. */
export function bunExecutable(): string;

/** Directory holding a `node` that is `bun` (created, or repaired when it points elsewhere). */
export function bunNodeShim(dir?: string, bun?: string): string;

/** The `next` CLI installed by the app in `cwd`. Throws when the app has no `next`. */
export function nextBin(cwd?: string): string;

export interface NextCommand {
  cmd: string[];
  env: Record<string, string | undefined>;
}

/** `bun --bun <app's next> ...args`, with the shim first on PATH and telemetry off unless set. */
export function nextCommand(args: string[], cwd?: string, shim?: string): NextCommand;

/** Runs `next <argv>` in `cwd` with inherited stdio; resolves to its exit code. */
export function runNext(argv: string[], cwd?: string): Promise<number>;
