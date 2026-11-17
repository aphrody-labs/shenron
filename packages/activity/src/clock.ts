// SPDX-License-Identifier: Apache-2.0
/**
 * Injectable time source. The rules never read the system clock themselves: the server passes
 * `systemClock`, tests pass a `ManualClock` (`@aphrody/shenron-activity/testing`). Only the server's
 * clock decides anything (answer times, deadlines); the client's clock is never trusted.
 */
export interface Clock {
  /** Milliseconds since the Unix epoch. */
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };
