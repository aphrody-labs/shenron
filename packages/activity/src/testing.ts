// SPDX-License-Identifier: Apache-2.0
/**
 * `@aphrody/shenron-activity/testing` — test helpers shared with the Activity server's own tests.
 * Runtime class `pure`.
 */
import type { Clock } from "./clock";

/** A clock that only moves when told to. */
export class ManualClock implements Clock {
  #now: number;

  constructor(start = 1_800_000_000_000) {
    this.#now = start;
  }

  now(): number {
    return this.#now;
  }

  /** Moves forward by `ms` and returns the new time. */
  advance(ms: number): number {
    if (!Number.isFinite(ms) || ms < 0) throw new RangeError("a clock only moves forward");
    this.#now += ms;
    return this.#now;
  }

  set(time: number): void {
    if (!Number.isFinite(time) || time < this.#now)
      throw new RangeError("a clock only moves forward");
    this.#now = time;
  }
}
