#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Build the Shenron desktop installer (Tauri 3): the native app, the shenron-server sidecar
 * (front app, Shenron API and local APIs, one file), the shenron-mcp sidecar (MCP tools of the
 * chat and the `/mcp` endpoint; shenron-server starts it from beside itself) and the platform
 * bundle.
 *
 *   bun scripts/build/desktop.ts [--target windows-x64|linux-x64] [--skip-server] [--skip-mcp]
 *
 * --skip-mcp ships no MCP sidecar: the desktop then reports its MCP group unavailable.
 * windows-x64 from Linux/WSL: the app is cross-compiled with cargo-xwin and the NSIS
 * installer is produced by the Windows NSIS toolset through scripts/build/makensis-wsl.ts.
 * Outputs land in dist/desktop/<target>/ with their SHA-256 in SHA256SUMS.
 */
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../..");
const CRATE = join(ROOT, "crates/shenron-desktop");
const args = process.argv.slice(2);
const index = args.indexOf("--target");
const target = (
  index >= 0 ? args[index + 1] : process.platform === "win32" ? "windows-x64" : "linux-x64"
) as "windows-x64" | "linux-x64";
const SPEC = {
  "windows-x64": { triple: "x86_64-pc-windows-msvc", exe: ".exe", bundles: "nsis" },
  "linux-x64": { triple: "x86_64-unknown-linux-gnu", exe: "", bundles: "deb,appimage" },
}[target];
if (!SPEC) throw new Error("--target windows-x64|linux-x64");

const env: Record<string, string> = { CARGO_TARGET_DIR: join(ROOT, "target") };
const runner = join(ROOT, "scripts/build/rust/cargo-runner.ts");

async function run(command: string[], cwd: string, env: Record<string, string> = {}) {
  const child = Bun.spawn(command, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["inherit", "inherit", "inherit"],
  });
  if ((await child.exited) !== 0) throw new Error(`${command.slice(0, 3).join(" ")} failed`);
}

// 1. Sidecar: the autonomous server binary of the same target.
const server = join(ROOT, "dist/server", target, `shenron-server${SPEC.exe}`);
if (!args.includes("--skip-server") || !existsSync(server)) {
  await run([process.execPath, join(ROOT, "scripts/build/server.ts"), "--target", target], ROOT);
}
const binaries = join(CRATE, "binaries");
mkdirSync(binaries, { recursive: true });
copyFileSync(server, join(binaries, `shenron-server-${SPEC.triple}${SPEC.exe}`));

// 1b. MCP sidecar of the same target (cargo, or cargo-xwin for MSVC from Linux, via the runner).
// The desktop ships the Koharu engine, so its sidecar registers the scanlation tools (`koharu`).
const withMcp = !args.includes("--skip-mcp");
const mcpSidecar = join(binaries, `shenron-mcp-${SPEC.triple}${SPEC.exe}`);
rmSync(mcpSidecar, { force: true });
if (withMcp) {
  await run(
    [
      process.execPath,
      runner,
      "build",
      "--release",
      "-p",
      "shenron-mcp",
      "--features",
      "koharu",
      "--target",
      SPEC.triple,
    ],
    ROOT,
    env,
  );
  copyFileSync(join(ROOT, "target", SPEC.triple, "release", `shenron-mcp${SPEC.exe}`), mcpSidecar);
}

// 2. Bundle configuration: the sidecars are declared only for bundling builds. Tauri installs
// them beside the app, where shenron-server finds shenron-mcp.
const bundleConfig = join(CRATE, "tauri.bundle.json");
const externalBin = ["binaries/shenron-server", ...(withMcp ? ["binaries/shenron-mcp"] : [])];
writeFileSync(bundleConfig, `${JSON.stringify({ bundle: { externalBin } }, null, 2)}\n`);

// 3. NSIS from WSL: a `makensis` on PATH that drives the Windows toolset.
if (target === "windows-x64" && process.platform !== "win32") {
  const shim = join(ROOT, "target/makensis-shim");
  mkdirSync(shim, { recursive: true });
  const makensis = join(shim, "makensis");
  writeFileSync(
    makensis,
    `#!/usr/bin/env bash\nexec "${process.execPath}" "${join(ROOT, "scripts/build/makensis-wsl.ts")}" "$@"\n`,
  );
  chmodSync(makensis, 0o755);
  env.PATH = `${shim}:${process.env.PATH}`;
}

// 4. Tauri build (the CLI compiles with --features custom-protocol and bundles).
await run(
  [
    "cargo-tauri",
    "build",
    "--target",
    SPEC.triple,
    "--bundles",
    SPEC.bundles,
    "--config",
    bundleConfig,
    "--runner",
    runner,
    "--ci",
  ],
  CRATE,
  env,
);

// 5. Collect installers and their checksums.
const out = join(ROOT, "dist/desktop", target);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const bundleDir = join(ROOT, "target", SPEC.triple, "release/bundle");
const artifacts: string[] = [];
for (const kind of readdirSync(bundleDir)) {
  for (const file of readdirSync(join(bundleDir, kind))) {
    const path = join(bundleDir, kind, file);
    if (!statSync(path).isFile() || !/\.(exe|msi|deb|AppImage|rpm)$/.test(file)) continue;
    copyFileSync(path, join(out, file));
    artifacts.push(file);
  }
}
const sums: string[] = [];
for (const file of artifacts.sort()) {
  const digest = new Bun.CryptoHasher("sha256")
    .update(await Bun.file(join(out, file)).bytes())
    .digest("hex");
  sums.push(`${digest}  ${file}`);
}
writeFileSync(join(out, "SHA256SUMS"), `${sums.join("\n")}\n`);
console.log(
  JSON.stringify({
    target,
    out,
    artifacts: artifacts.map((f) => ({
      file: f,
      sizeMiB: Math.round(statSync(join(out, f)).size / 1048576),
    })),
  }),
);
