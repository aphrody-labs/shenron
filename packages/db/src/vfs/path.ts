// SPDX-License-Identifier: Apache-2.0
/**
 * VFS path normalisation, ported from `aphrody-shell-vfs` (`crates/shell/vfs/src/path.rs`,
 * aphrody-labs/aphrody). Normal form: `/` or `/a/b` (absolute, no `.`, `..`, empty
 * components or trailing slash); `..` at the root stays at the root. Lengths are counted
 * in UTF-8 bytes, like the Rust byte paths. Runtime class: `pure`.
 */

/** Maximum normalised path length in bytes. */
export const MAX_PATH_LEN = 4096;
/** Maximum length of one component in bytes. */
export const MAX_NAME_LEN = 255;

/** Backend-independent error kinds of the Aphrody VFS contract. */
export type VfsErrorCode =
  | "NotFound"
  | "AlreadyExists"
  | "NotADirectory"
  | "IsADirectory"
  | "DirectoryNotEmpty"
  | "InvalidPath"
  | "InvalidInput"
  | "FileTooLarge"
  | "QuotaExceeded"
  | "ReadOnly"
  | "Io";

const MESSAGES: Record<VfsErrorCode, string> = {
  NotFound: "no such file or directory",
  AlreadyExists: "file exists",
  NotADirectory: "not a directory",
  IsADirectory: "is a directory",
  DirectoryNotEmpty: "directory not empty",
  InvalidPath: "invalid path",
  InvalidInput: "invalid argument",
  FileTooLarge: "file too large",
  QuotaExceeded: "quota exceeded",
  ReadOnly: "read-only filesystem",
  Io: "i/o error",
};

export class VfsError extends Error {
  readonly code: VfsErrorCode;
  constructor(code: VfsErrorCode, detail?: string) {
    super(detail ? `${MESSAGES[code]}: ${detail}` : MESSAGES[code]);
    this.name = "VfsError";
    this.code = code;
  }
}

const encoder = new TextEncoder();
const byteLength = (value: string): number => encoder.encode(value).length;

function normalizeFrom(stack: string[], path: string): string {
  if (path.includes("\0")) throw new VfsError("InvalidPath");
  for (const comp of path.split("/")) {
    if (comp === "" || comp === ".") continue;
    if (comp === "..") {
      stack.pop();
      continue;
    }
    if (byteLength(comp) > MAX_NAME_LEN) throw new VfsError("InvalidPath");
    stack.push(comp);
  }
  const out = stack.length === 0 ? "/" : `/${stack.join("/")}`;
  if (byteLength(out) > MAX_PATH_LEN) throw new VfsError("InvalidPath");
  return out;
}

/** Normalise an absolute path; relative, empty or NUL-bearing paths are `InvalidPath`. */
export function normalize(path: string): string {
  if (!path.startsWith("/")) throw new VfsError("InvalidPath");
  return normalizeFrom([], path);
}

/** Resolve `path` against the absolute `cwd`; an absolute `path` ignores `cwd`. */
export function resolve(cwd: string, path: string): string {
  if (path.startsWith("/")) return normalize(path);
  if (!cwd.startsWith("/")) throw new VfsError("InvalidPath");
  return normalizeFrom([...components(cwd)], path);
}

/** Components of a path (split on `/`, empty ones skipped). Does not normalise. */
export function components(path: string): string[] {
  return path.split("/").filter((c) => c !== "");
}

/** Join an already-normalised directory and one component. */
export function join(dir: string, name: string): string {
  return dir.endsWith("/") ? `${dir}${name}` : `${dir}/${name}`;
}

/** Parent of a normalised path and its final component; `null` for the root. */
export function splitParent(norm: string): { parent: string; name: string } | null {
  if (norm === "/") return null;
  const idx = norm.lastIndexOf("/");
  if (idx < 0) return null;
  return { parent: idx === 0 ? "/" : norm.slice(0, idx), name: norm.slice(idx + 1) };
}

/** `true` when `path` is `dir` itself or lies below it (both normalised). */
export function isWithin(path: string, dir: string): boolean {
  return dir === "/" || path === dir || path.startsWith(`${dir}/`);
}
