// SPDX-License-Identifier: Apache-2.0
/**
 * Versioned, bounded `custom_id`s: `<namespace>:v<version>:<arg>:<arg>…`.
 *
 * Discord caps a `custom_id` at 100 characters and gives a component nothing else to carry state,
 * so a stateless button (a page number, the item to buy…) writes it in the id. The format is
 * strict on purpose:
 *
 *  - the namespace routes the click (`@ButtonComponent({ id: customIdPattern("shop") })`);
 *  - the version lets a handler refuse the ids of an older message instead of misreading them
 *    after the arguments change shape (it answers "expired", not garbage);
 *  - arguments are percent-encoded, so a `:` or any text coming from a user cannot forge or
 *    shift a field; the encoded length is what counts against the limit, and an id that does not
 *    fit throws at build time rather than costing a whole reply at send time.
 */
import { LIMITS } from "./limits";

const NAMESPACE = /^[a-z][a-z0-9.-]{0,23}$/;
const ID_HEAD = /^([a-z][a-z0-9.-]{0,23}):v(\d{1,2})(?::(.*))?$/s;
/** Characters `encodeURIComponent` leaves alone that are still safe in an id. */
const SEPARATOR = ":";

export type CustomIdArg = string | number;

export class CustomIdError extends Error {
  override name = "CustomIdError";
}

export interface ParsedCustomId {
  ns: string;
  version: number;
  /** Decoded arguments, always strings (`intArg()` reads numbers back). */
  args: string[];
}

/**
 * Builds a custom id. Throws `CustomIdError` when the namespace or version is malformed, an
 * argument is not a finite number or a string, or the encoded id exceeds 100 characters.
 */
export function customId(ns: string, version: number, ...args: CustomIdArg[]): string {
  if (!NAMESPACE.test(ns)) throw new CustomIdError(`invalid custom id namespace: "${ns}"`);
  if (!Number.isInteger(version) || version < 0 || version > 99) {
    throw new CustomIdError(`invalid custom id version for "${ns}": ${version}`);
  }
  const encoded = args.map((arg) => {
    if (typeof arg === "number") {
      if (!Number.isFinite(arg))
        throw new CustomIdError(`non-finite custom id argument in "${ns}"`);
      return String(arg);
    }
    if (typeof arg !== "string") throw new CustomIdError(`invalid custom id argument in "${ns}"`);
    try {
      return encodeURIComponent(arg);
    } catch {
      throw new CustomIdError(`malformed text in a custom id argument of "${ns}"`);
    }
  });
  const id = [`${ns}:v${version}`, ...encoded].join(SEPARATOR);
  if (id.length > LIMITS.customId) {
    throw new CustomIdError(
      `custom id of "${ns}" is ${id.length} characters (max ${LIMITS.customId}): ${id.slice(0, 40)}…`,
    );
  }
  return id;
}

/** The parts of a versioned id, or `null` when `id` is not one (legacy ids, malformed escapes). */
export function parseCustomId(id: string): ParsedCustomId | null {
  const match = ID_HEAD.exec(id);
  if (!match) return null;
  const rest = match[3];
  try {
    const args = rest === undefined ? [] : rest.split(SEPARATOR).map(decodeURIComponent);
    return { ns: match[1]!, version: Number(match[2]), args };
  } catch {
    return null;
  }
}

/** Pattern for `@ButtonComponent({ id })`, `@SelectMenuComponent` and `@ModalComponent`. */
export function customIdPattern(ns: string): RegExp {
  if (!NAMESPACE.test(ns)) throw new CustomIdError(`invalid custom id namespace: "${ns}"`);
  return new RegExp(`^${ns.replaceAll(".", "\\.")}:v\\d{1,2}(?::|$)`);
}

/** True when `id` belongs to `ns` (any version, or exactly `version`). */
export function isCustomIdOf(id: string, ns: string, version?: number): boolean {
  const parsed = parseCustomId(id);
  return (
    parsed !== null && parsed.ns === ns && (version === undefined || parsed.version === version)
  );
}

/** An argument read back as an integer within `range`, else `fallback`. */
export function intArg(
  value: string | undefined,
  fallback: number,
  range: { min?: number; max?: number } = {},
): number {
  if (value === undefined || !/^-?\d+$/.test(value)) return fallback;
  const n = Number(value);
  const { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = range;
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : fallback;
}
