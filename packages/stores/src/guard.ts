// SPDX-License-Identifier: Apache-2.0
/** Strict readers for untyped JSON: a wrong shape is an error that names the path, never a silent default. */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export class ShapeError extends Error {
  constructor(path: string, expected: string, value: unknown) {
    super(`${path}: expected ${expected}, got ${value === null ? "null" : typeof value}`);
    this.name = "ShapeError";
  }
}

export function asObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new ShapeError(path, "object", value);
  return value as Record<string, unknown>;
}

export function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new ShapeError(path, "array", value);
  return value;
}

export function asString(value: unknown, path: string): string {
  if (typeof value !== "string") throw new ShapeError(path, "string", value);
  return value;
}

export function optString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function optNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function optStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/** `2025-09-10T07:00:00Z` or `2025-09-10` to `2025-09-10`; anything else is null. */
export function isoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? match[1]! : null;
}
