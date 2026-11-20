#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * The Rust binaries of the runtime image (`shenron-mcp`, `libshenron_ffi.so`, `koharu-sdk`) are
 * built in aphrody-labs/wiki, never in this repository. This script locates them
 * (scripts/build/wiki-artifacts.ts: `SHENRON_NATIVE_DIR`, else `<SHENRON_WIKI_DIR>/target`, default
 * `../wiki/target`) and hands them to the image build.
 *
 *   bun scripts/deploy/native-artifacts.ts digest   SHA-256 of the three artifacts (the `native` key of the server lane)
 *   bun scripts/deploy/native-artifacts.ts stage    copy them to dist/mcp and dist/server/linux-x64/native
 *
 * Both fail with the list of what is missing when the wiki build is absent.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { nativeArtifact } from "../build/wiki-artifacts.ts";

const ROOT = resolve(import.meta.dir, "../..");
const TRIPLE = "x86_64-unknown-linux-gnu";

/** Artifact file name and its place in the release tree (what deploy/docker/Dockerfile copies). */
export const ARTIFACTS = [
  { file: "shenron-mcp", dest: "dist/mcp/linux-x64/shenron-mcp" },
  { file: "libshenron_ffi.so", dest: "dist/server/linux-x64/native/libshenron_ffi.so" },
  { file: "koharu-sdk", dest: "dist/server/linux-x64/native/koharu-sdk" },
] as const;

export function locate(): { file: string; dest: string; path: string }[] {
  const found: { file: string; dest: string; path: string }[] = [];
  const missing: string[] = [];
  for (const { file, dest } of ARTIFACTS) {
    const path = nativeArtifact(TRIPLE, file);
    if (path) found.push({ file, dest, path });
    else missing.push(file);
  }
  if (missing.length)
    throw new Error(
      `native artifacts missing: ${missing.join(", ")}. Build them in aphrody-labs/wiki (Rust is not ` +
        "built here) and set SHENRON_NATIVE_DIR (or SHENRON_WIKI_DIR) to the output",
    );
  return found;
}

export async function digest(): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  for (const artifact of locate())
    hasher.update(`${artifact.file}\0`).update(await Bun.file(artifact.path).bytes());
  return hasher.digest("hex");
}

if (import.meta.main) {
  try {
    const command = Bun.argv[2];
    if (command === "digest") console.log(await digest());
    else if (command === "stage") {
      for (const artifact of locate()) {
        const dest = join(ROOT, artifact.dest);
        mkdirSync(dirname(dest), { recursive: true });
        copyFileSync(artifact.path, dest);
      }
    } else {
      console.error("usage: native-artifacts.ts digest | stage");
      process.exit(64);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
