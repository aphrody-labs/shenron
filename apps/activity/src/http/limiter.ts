// SPDX-License-Identifier: Apache-2.0
/** Fixed-window rate limiter keyed by string; memory is bounded by pruning expired windows. */
export interface Limiter {
  /** Counts one hit for `key`; returns `0` when allowed, else the milliseconds until the window ends. */
  take(key: string): number;
}

export interface LimiterOptions {
  readonly max: number;
  readonly windowMs: number;
  readonly now?: () => number;
  /** Keys remembered at most; the oldest windows go first. */
  readonly maxKeys?: number;
}

export function createLimiter(options: LimiterOptions): Limiter {
  const now = options.now ?? Date.now;
  const maxKeys = options.maxKeys ?? 10_000;
  const windows = new Map<string, { count: number; resetAt: number }>();
  return {
    take(key) {
      const time = now();
      let window = windows.get(key);
      if (!window || window.resetAt <= time) {
        if (windows.size >= maxKeys) {
          for (const [candidate, value] of windows) {
            if (value.resetAt <= time) windows.delete(candidate);
          }
          // Still full of live windows: forget the oldest rather than grow without bound.
          if (windows.size >= maxKeys) windows.delete(windows.keys().next().value as string);
        }
        window = { count: 0, resetAt: time + options.windowMs };
        windows.set(key, window);
      }
      window.count += 1;
      return window.count > options.max ? window.resetAt - time : 0;
    },
  };
}
