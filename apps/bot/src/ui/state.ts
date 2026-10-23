// SPDX-License-Identifier: Apache-2.0
/**
 * Shared bits of the stateless components (pager, confirm, share): the expiry written in the
 * `custom_id` and the "is this click allowed" gate.
 *
 * A component's state lives in its id, so it survives a restart and needs no collector; the cost
 * is that nothing ever expires by itself. Components that must stop working (a destructive
 * confirmation, a vote) carry an expiry: a coarse, compact timestamp (minutes since the epoch
 * in base 36, 6 characters until the year 2100). A click past it, or on an id written by another
 * version, is answered "expired" instead of acting on stale data.
 */
import { UiBuildError } from "./errors";

const MINUTE_MS = 60_000;

/** `""` for "never", else the expiry of `now + ttlMs` in base-36 minutes. */
export function encodeExpiry(ttlMs: number | undefined, now = Date.now()): string {
  if (ttlMs === undefined || !Number.isFinite(ttlMs) || ttlMs <= 0) return "";
  return Math.ceil((now + ttlMs) / MINUTE_MS).toString(36);
}

/** Epoch milliseconds of an encoded expiry, `undefined` for "never" or a malformed value. */
export function decodeExpiry(encoded: string | undefined): number | undefined {
  if (!encoded || !/^[0-9a-z]{1,8}$/.test(encoded)) return undefined;
  const minutes = Number.parseInt(encoded, 36);
  return Number.isSafeInteger(minutes) ? minutes * MINUTE_MS : undefined;
}

export type GateResult = "ok" | "expired" | "not-owner";

/** Whether `userId` may use a component that expires at `expiresAt` and belongs to `owner`. */
export function gate(
  state: { expiresAt?: number; owner?: string },
  userId: string,
  now = Date.now(),
): GateResult {
  if (state.expiresAt !== undefined && now > state.expiresAt) return "expired";
  if (state.owner && state.owner !== userId) return "not-owner";
  return "ok";
}

const KIND = /^[a-z][a-z0-9.-]{0,15}$/;

/** A component kind (the key of a registered handler): short, lowercase, no separator. */
export function assertKind(kind: string): string {
  if (!KIND.test(kind)) throw new UiBuildError(`invalid component kind: "${kind}"`);
  return kind;
}

const SNOWFLAKE = /^\d{15,21}$/;

/** `""` for "anyone", else the snowflake of the only user allowed to click. */
export function ownerArg(owner: string | undefined): string {
  if (owner === undefined) return "";
  if (!SNOWFLAKE.test(owner)) throw new UiBuildError(`invalid component owner: "${owner}"`);
  return owner;
}
