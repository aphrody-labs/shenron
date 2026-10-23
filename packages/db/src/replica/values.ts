// SPDX-License-Identifier: Apache-2.0
/**
 * Value conversion between the two sides of the replica.
 *
 * SQLite integers arrive as `bigint` when the snapshot reads them with `safeIntegers` (the engine
 * does: an XP total above 2^53 must not lose digits on its way to a PostgreSQL `bigint`), as numbers
 * otherwise; PostgreSQL clients return `int8` as text, `numeric` as text, timestamps as `Date` and
 * `jsonb` as parsed documents. Every conversion here accepts all of those shapes.
 */

const INTEGER_TYPES = new Set(["int2", "int4", "int8"]);
const FLOAT_TYPES = new Set(["float4", "float8"]);
export const TEXT_TYPES = new Set(["text", "varchar", "bpchar", "name", "citext"]);
export const JSON_TYPES = new Set(["json", "jsonb"]);
const TIME_TYPES = new Set(["timestamp", "timestamptz", "date"]);

export const SUPPORTED_TYPES = new Set([
  ...INTEGER_TYPES,
  ...FLOAT_TYPES,
  ...TEXT_TYPES,
  ...JSON_TYPES,
  ...TIME_TYPES,
  "numeric",
  "bool",
]);

export type Side = "source" | "target";

/** SQLite stores either seconds or milliseconds in integer timestamp columns. */
function epochMilliseconds(value: number): number {
  return Math.abs(value) >= 1e11 ? value : value * 1000;
}

/** JSON with sorted keys, so two equal documents compare equal whatever their key order. */
export function stableStringify(value: unknown): string {
  if (typeof value === "bigint") return value.toString();
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, member]) => member !== undefined)
    .toSorted(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([key, member]) => `${JSON.stringify(key)}:${stableStringify(member)}`).join(",")}}`;
}

function booleanOf(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === 0 || value === 1) return value === 1;
  if (typeof value === "bigint" && (value === 0n || value === 1n)) return value === 1n;
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (text === "1" || text === "t" || text === "true") return true;
    if (text === "0" || text === "f" || text === "false") return false;
  }
  return undefined;
}

function milliseconds(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return epochMilliseconds(value);
  if (typeof value === "bigint") return epochMilliseconds(Number(value));
  return Date.parse(String(value));
}

/**
 * A value in the shape both sides compare in. The same type means the same string, whatever the
 * driver returned: `int8` arrives as text from PostgreSQL and as a bigint or number from SQLite,
 * `bool` as true/false against 0/1, `jsonb` as a parsed document against SQLite text, a timestamp
 * as a Date against epoch milliseconds.
 */
export function canonicalValue(value: unknown, pgType: string, side: Side): string | null {
  if (value === null || value === undefined) return null;
  if (INTEGER_TYPES.has(pgType)) {
    if (typeof value === "boolean") return value ? "1" : "0";
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "string" && /^[+-]?\d+$/.test(value.trim())) {
      return BigInt(value.trim()).toString();
    }
    return String(Number(value));
  }
  if (FLOAT_TYPES.has(pgType) || pgType === "numeric") {
    if (typeof value === "bigint" && pgType === "numeric") return value.toString();
    const number = Number(value);
    return Number.isFinite(number) ? String(number) : String(value);
  }
  if (pgType === "bool") {
    const flag = booleanOf(value);
    return flag === undefined ? String(value) : flag ? "1" : "0";
  }
  if (JSON_TYPES.has(pgType)) {
    // A string read from PostgreSQL is a JSON string scalar; one read from SQLite is JSON text.
    if (typeof value === "string" && side === "source") {
      try {
        return stableStringify(JSON.parse(value));
      } catch {
        return `invalid-json:${value}`;
      }
    }
    return stableStringify(value);
  }
  if (TIME_TYPES.has(pgType)) {
    const parsed = milliseconds(value);
    return Number.isNaN(parsed) ? String(value) : String(parsed);
  }
  if (value instanceof Uint8Array) return `blob:${Buffer.from(value).toString("hex")}`;
  return String(value);
}

/** The bind parameter for a SQLite value; throws a readable error for an inconvertible one. */
export function toPgParam(value: unknown, pgType: string): unknown {
  if (value === null || value === undefined) return null;
  if (INTEGER_TYPES.has(pgType)) {
    if (typeof value === "boolean") return value ? 1 : 0;
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "number" && Number.isInteger(value)) return value;
    if (typeof value === "string" && /^[+-]?\d+$/.test(value.trim())) return value.trim();
    throw new Error(`${JSON.stringify(value)} is not an integer for ${pgType}`);
  }
  if (FLOAT_TYPES.has(pgType) || pgType === "numeric") {
    if (typeof value === "bigint" && pgType === "numeric") return value.toString();
    const number = Number(value);
    if (typeof value === "boolean" || !Number.isFinite(number)) {
      throw new Error(`${displayValue(value)} is not a number for ${pgType}`);
    }
    return pgType === "numeric" ? String(number) : number;
  }
  if (pgType === "bool") {
    const flag = booleanOf(value);
    if (flag === undefined) throw new Error(`${displayValue(value)} is not a boolean`);
    return flag;
  }
  if (JSON_TYPES.has(pgType)) {
    if (typeof value === "string") {
      try {
        JSON.parse(value);
      } catch {
        throw new Error(`invalid JSON for ${pgType}: ${value.slice(0, 40)}`);
      }
      return value;
    }
    return stableStringify(value);
  }
  if (TIME_TYPES.has(pgType)) {
    const time = milliseconds(value);
    if (!Number.isFinite(time)) throw new Error(`${displayValue(value)} is not a date`);
    const iso = new Date(time).toISOString();
    return pgType === "date" ? iso.slice(0, 10) : iso;
  }
  if (value instanceof Uint8Array) throw new Error(`a blob cannot be written to ${pgType}`);
  return String(value);
}

/** `JSON.stringify` that does not throw on a bigint, for error messages. */
function displayValue(value: unknown): string {
  return typeof value === "bigint" ? value.toString() : (JSON.stringify(value) ?? String(value));
}
