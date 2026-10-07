// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";

const tag = Bun.argv[2];
if (!tag) throw new Error("Usage: bun scripts/release/check-version.ts vX.Y.Z");

const cargo = await readFile("Cargo.toml", "utf8");
const workspaceVersion = cargo.match(
  /\[workspace\.package\][\s\S]*?^version\s*=\s*"([^"]+)"/m,
)?.[1];
if (!workspaceVersion) throw new Error("Cargo.toml has no workspace package version");

const manifests = ["apps/site/package.json", "apps/bot/package.json", "apps/server/package.json"];
const versions = await Promise.all(
  manifests.map(async (path) => {
    const manifest = JSON.parse(await readFile(path, "utf8")) as { version?: string };
    if (!manifest.version) throw new Error(`${path} has no version`);
    return [path, manifest.version] as const;
  }),
);

const expectedTag = `v${workspaceVersion}`;
const mismatches = versions.filter(([, version]) => version !== workspaceVersion);
if (tag !== expectedTag || mismatches.length > 0) {
  const detail = mismatches.map(([path, version]) => `${path}=${version}`).join(", ");
  throw new Error(
    `Release must use ${expectedTag}; workspace=${workspaceVersion}; mismatched manifests: ${detail || "none"}; got ${tag}`,
  );
}

console.log(`Release ${tag}: all product manifests use ${workspaceVersion}`);
