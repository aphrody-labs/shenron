// SPDX-License-Identifier: Apache-2.0
import { lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const PUBLIC_LIBRARY_FILES: Readonly<Record<string, readonly string[]>> = {
  "@shenron/api": ["src", "LICENSE", "openapi"],
  "@shenron/auth": ["src", "LICENSE"],
  "@shenron/config": ["src", "LICENSE", "tsconfig"],
  "@shenron/db": ["src", "LICENSE"],
  "@shenron/dbxv2": ["src", "LICENSE"],
  "@shenron/engine": ["src", "LICENSE"],
  "@shenron/images": ["src", "LICENSE"],
  "@shenron/koharu": ["src", "LICENSE"],
  "@shenron/lexicon": ["src", "LICENSE"],
  "@shenron/media": ["src", "LICENSE"],
  "@shenron/native": ["src", "LICENSE"],
  "@shenron/pipeline": ["src", "LICENSE"],
  "@shenron/ui": ["src", "LICENSE", "assets"],
};

export interface PublicationManifest {
  name?: string;
  private?: boolean;
  files?: unknown;
  exports?: unknown;
  license?: unknown;
  publishConfig?: { access?: unknown; registry?: unknown };
}
function exportTargets(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object") return Object.values(value).flatMap(exportTargets);
  return [];
}
export function protectedPackagePath(path: string): boolean {
  const parts = path.replaceAll("\\", "/").split("/");
  return (
    parts.some((part) =>
      [
        "..",
        ".env",
        ".git",
        ".shenron",
        ".codex",
        ".claude",
        "cookies",
        "credentials",
        "secrets",
        "sessions",
        "corpus",
        "datasets",
        "weights",
        "backups",
        "node_modules",
      ].includes(part.toLowerCase()),
    ) ||
    /(?:^|\/)data\/home(?:\/|$)/i.test(path) ||
    parts.some(
      (part) =>
        /^\.env/i.test(part) ||
        /^(?:cookie|cookies|session|sessions|credentials|secrets)\.json$/i.test(part) ||
        /\.(?:sqlite(?:3)?(?:-wal|-shm)?|db|gguf|safetensors|onnx|pt|pth|ckpt|bin|pkl|pem|key|jsonl|env)$/i.test(
          part,
        ),
    )
  );
}
export function publicationViolations(manifest: PublicationManifest, location: string): string[] {
  const issues: string[] = [];
  const approved = manifest.name ? PUBLIC_LIBRARY_FILES[manifest.name] : undefined;
  if (!location.startsWith("packages/") || !approved) {
    if (manifest.private !== true)
      issues.push("application or unapproved workspace must remain private");
    if (manifest.files !== undefined)
      issues.push("private workspace cannot declare a public files allowlist");
    return issues;
  }
  const expectedLocation = `packages/${manifest.name!.slice("@shenron/".length)}`;
  if (location !== expectedLocation)
    issues.push("public package identity differs from its approved workspace");
  if (manifest.private !== false)
    issues.push("approved public library must explicitly declare private:false");
  if (
    manifest.publishConfig?.access !== "public" ||
    manifest.publishConfig?.registry !== "https://registry.npmjs.org/"
  )
    issues.push("public library must declare its approved registry and access");
  if (typeof manifest.license !== "string" || !manifest.license)
    issues.push("public library license is required");
  const files =
    Array.isArray(manifest.files) && manifest.files.every((item) => typeof item === "string")
      ? (manifest.files as string[])
      : [];
  if (
    files.length !== approved.length ||
    new Set(files).size !== files.length ||
    approved.some((path) => !files.includes(path))
  )
    issues.push("public files differ from the reviewed library allowlist");
  for (const file of files)
    if (protectedPackagePath(file)) issues.push(`protected public allowlist path: ${file}`);
  for (const target of exportTargets(manifest.exports)) {
    const path = target.replace(/^\.\//, "");
    if (
      !target.startsWith("./") ||
      protectedPackagePath(path) ||
      !files.some((file) => path === file || path.startsWith(file + "/"))
    )
      issues.push(`export is outside the reviewed public allowlist: ${target}`);
  }
  return issues;
}

/** Inspect only the reviewed publication roots; never follow source/store symlinks. */
export function publicFileViolations(directory: string, files: readonly string[]): string[] {
  const issues: string[] = [];
  function visit(relative: string) {
    if (protectedPackagePath(relative)) {
      issues.push(`protected file in public payload: ${relative}`);
      return;
    }
    let stat;
    try {
      stat = lstatSync(join(directory, relative));
    } catch {
      issues.push(`public allowlist path is absent: ${relative}`);
      return;
    }
    if (stat.isSymbolicLink()) {
      issues.push(`public payload symlink is forbidden: ${relative}`);
      return;
    }
    if (stat.isDirectory())
      for (const entry of readdirSync(join(directory, relative))) visit(`${relative}/${entry}`);
    else if (!stat.isFile() || (stat.size === 0 && relative === "LICENSE"))
      issues.push(`public notice or file is invalid: ${relative}`);
  }
  for (const path of files) visit(path);
  return issues;
}

/** Shenron is standalone: no manifest may depend on an @aphrody/* package. */
export function standaloneDependency(
  name: string,
  version: string,
  localIdentities: ReadonlySet<string>,
): boolean {
  if (name.startsWith("@aphrody/")) return false;
  if (version === "workspace:*") return name.startsWith("@shenron/") && localIdentities.has(name);
  return true;
}
