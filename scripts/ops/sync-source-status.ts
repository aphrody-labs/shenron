// SPDX-License-Identifier: Apache-2.0
import { readdir, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
export function registryUrl(kind: "npm" | "crate", name: string, version: string): string {
  if (!name || !version) throw new Error("Registry identity is required");
  return kind === "npm"
    ? `https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(version)}`
    : `https://crates.io/api/v1/crates/${encodeURIComponent(name)}/${encodeURIComponent(version)}`;
}
export async function lookup(url: string): Promise<Record<string, unknown>> {
  try {
    const response = await fetch(`${url}?shenron_sync=${Date.now()}`, {
      headers: {
        "User-Agent": "shenron-source-sync/1.4.4 (https://github.com/aphrody-labs/shenron)",
      },
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
    if (!response.ok)
      return {
        status: response.status,
        state: response.status === 404 ? "missing" : "unavailable",
      };
    const value = (await response.json()) as {
      dist?: { shasum?: string; integrity?: string };
      version?: { checksum?: string; yanked?: boolean };
    };
    if (
      !/^[a-f0-9]{40}$/.test(value.dist?.shasum ?? "") &&
      !/^[a-f0-9]{64}$/.test(value.version?.checksum ?? "")
    )
      return { status: 200, state: "unverified" };
    return {
      status: 200,
      state: "published",
      ...(value.dist ? { sha1: value.dist.shasum, integrity: value.dist.integrity } : {}),
      ...(value.version ? { sha256: value.version.checksum, yanked: value.version.yanked } : {}),
    };
  } catch {
    return { state: "unavailable" };
  }
}
export async function run(): Promise<void> {
  const packages: Record<string, unknown>[] = [];
  const crates: Record<string, unknown>[] = [];
  const vendors: Record<string, unknown>[] = [];
  const integrations: Record<string, unknown>[] = [];
  for (const folder of (await readdir(join(root, "packages"))).toSorted()) {
    const file = Bun.file(join(root, "packages", folder, "package.json"));
    if (!(await file.exists())) continue;
    const bytes = await file.text();
    const manifest = JSON.parse(bytes) as { name: string; version: string; private?: boolean };
    packages.push({
      path: `packages/${folder}/package.json`,
      name: manifest.name,
      version: manifest.version,
      private: manifest.private === true,
      sourceSha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
      registry:
        manifest.private === true
          ? { state: "private" }
          : await lookup(registryUrl("npm", manifest.name, manifest.version)),
    });
  }
  const hlsPath = "vendor/hls.js";
  const hlsManifest = Bun.file(join(root, hlsPath, "package.json"));
  if (await hlsManifest.exists()) {
    const bytes = await hlsManifest.text();
    const manifest = JSON.parse(bytes) as { name: string; version: string; private?: boolean };
    if (manifest.name !== "@aphrody/hls.js") throw new Error("Unexpected HLS vendor identity");
    const head = Bun.spawnSync(["git", "-C", hlsPath, "rev-parse", "HEAD"], { cwd: root });
    const tree = Bun.spawnSync(["git", "ls-tree", "HEAD", "--", hlsPath], { cwd: root });
    const gitlink = /^160000 commit ([a-f0-9]{40})\tvendor\/hls\.js$/.exec(
      tree.stdout.toString().trim(),
    );
    vendors.push({
      path: `${hlsPath}/package.json`,
      name: manifest.name,
      version: manifest.version,
      sourceSha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
      commit: head.exitCode === 0 ? head.stdout.toString().trim() : null,
      gitlink: gitlink?.[1] ?? null,
      private: manifest.private === true,
      registry:
        manifest.private === true
          ? { state: "private" }
          : await lookup(registryUrl("npm", manifest.name, manifest.version)),
    });
  }
  const rootManifest = (await Bun.file(join(root, "package.json")).json()) as {
    workspaces?: { catalog?: Record<string, string> };
  };
  const sdkName = "@aphrody/bun-runtime-sdk";
  const sdkVersion = rootManifest.workspaces?.catalog?.[sdkName];
  if (sdkVersion && /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(sdkVersion))
    integrations.push({
      name: sdkName,
      version: sdkVersion,
      source: "package.json#workspaces.catalog",
      registry: await lookup(registryUrl("npm", sdkName, sdkVersion)),
    });
  for (const folder of (await readdir(join(root, "crates"))).toSorted()) {
    const file = Bun.file(join(root, "crates", folder, "Cargo.toml"));
    if (!(await file.exists())) continue;
    const bytes = await file.text();
    const manifest = Bun.TOML.parse(bytes) as {
      package?: { name: string; version: string | { workspace: boolean }; publish?: boolean };
    };
    if (!manifest.package) continue;
    const workspace = Bun.TOML.parse(await Bun.file(join(root, "Cargo.toml")).text()) as {
      workspace: { package: { version: string } };
    };
    const version =
      typeof manifest.package.version === "string"
        ? manifest.package.version
        : workspace.workspace.package.version;
    crates.push({
      path: `crates/${folder}/Cargo.toml`,
      name: manifest.package.name,
      version,
      publish: manifest.package.publish !== false,
      sourceSha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
      registry:
        manifest.package.publish === false
          ? { state: "private" }
          : await lookup(registryUrl("crate", manifest.package.name, version)),
    });
  }
  const git = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: root });
  if (git.exitCode !== 0) throw new Error("Git revision is unavailable");
  const directory = join(root, "var/reports/source-sync");
  await mkdir(directory, { recursive: true });
  const report = {
    verifiedAt: new Date().toISOString(),
    sourceRevision: git.stdout.toString().trim(),
    sourceDirty: Bun.spawnSync(["git", "diff", "--quiet", "HEAD"], { cwd: root }).exitCode !== 0,
    qualification:
      "Registry metadata only; installation, archive integrity and deployment require separate receipts",
    packages,
    vendors,
    integrations,
    crates,
  };
  await Bun.write(join(directory, "latest.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(
    `Source sync: ${packages.length} packages, ${vendors.length} vendors, ${crates.length} crates; var/reports/source-sync/latest.json`,
  );
}
if (import.meta.main) await run();
