#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Build the installer of Shenron Studio, the one desktop app (Tauri 3, `shenron-desktop`, the
 * editor engine in process): the native app, the shenron-server sidecar (front app, Shenron API
 * and local APIs, one file), the shenron-mcp sidecar (MCP tools of the chat and the `/mcp`
 * endpoint), the koharu-sdk sidecar (the editor engine over JSON Lines, for a browser on the
 * local server through `/api/local/koharu` and for `@aphrody/shenron-pipeline`; the app window itself
 * never uses it), the local chat model runtime (llama.cpp `llama-server` and the Shenron LoRA
 * adapter, scripts/build/chat-model-runtime.ts) and the platform bundle. shenron-server starts
 * the sidecars from beside itself.
 *
 *   bun scripts/build/desktop.ts [--target windows-x64|linux-x64] [--skip-server] [--skip-mcp]
 *                                [--skip-koharu-sdk] [--skip-chat-model] [--chat-lora <gguf>]
 *
 * --skip-mcp ships no MCP sidecar: the desktop then reports its MCP group unavailable.
 * --skip-koharu-sdk ships no engine sidecar: the local server then reports its koharu group
 * unavailable (the editor still runs in the app window).
 * --skip-chat-model ships neither llama-server nor the adapter: the chat then needs a server
 * declared by APHRODY_LOCAL_MODEL_URL. The base model (2.5 GB, too large for the installer) is
 * downloaded by shenron-server into SHENRON_HOME on first launch, digest-checked.
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

import { adapterSource, stageAdapter, stageLlamaRuntime } from "./chat-model-runtime";

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

const withMcp = !args.includes("--skip-mcp");
const withKoharuSdk = !args.includes("--skip-koharu-sdk");
const withServer = !args.includes("--skip-server");
const release = join(ROOT, "target", SPEC.triple, "release");

// 0. Every Rust artifact of the target in one Cargo invocation (one lock, one feature
// resolution, one remote job from WSL): the native library of shenron-server (shenron-ffi:
// local RAG, chat memory), the MCP sidecar with the scanlation tools (`koharu`), the editor
// engine sidecar with native file pickers (koharu-sdk, `desktop`) and the app itself
// (`custom-protocol`, as `cargo tauri build` asks). The runner reuses these artifacts when the
// Tauri build asks for the app again from the same worktree.
await run(
  [
    process.execPath,
    runner,
    "build",
    "--release",
    "-p",
    "shenron-desktop",
    "--bin",
    "shenron-desktop",
    ...(withServer ? ["-p", "shenron-ffi", "--lib"] : []),
    ...(withMcp ? ["-p", "shenron-mcp", "--bin", "shenron-mcp"] : []),
    ...(withKoharuSdk ? ["-p", "koharu-library", "--bin", "koharu-sdk"] : []),
    "--features",
    [
      "shenron-desktop/custom-protocol",
      ...(withMcp ? ["shenron-mcp/koharu"] : []),
      ...(withKoharuSdk ? ["koharu-library/desktop"] : []),
    ].join(","),
    "--target",
    SPEC.triple,
  ],
  ROOT,
  env,
);

// 1. Sidecar: the autonomous server binary of the same target (it embeds the fresh shenron-ffi).
const server = join(ROOT, "dist/server", target, `shenron-server${SPEC.exe}`);
if (withServer || !existsSync(server)) {
  await run([process.execPath, join(ROOT, "scripts/build/server.ts"), "--target", target], ROOT);
}
const binaries = join(CRATE, "binaries");
mkdirSync(binaries, { recursive: true });
copyFileSync(server, join(binaries, `shenron-server-${SPEC.triple}${SPEC.exe}`));

// 1b. MCP sidecar: shenron-server starts it from beside itself.
const mcpSidecar = join(binaries, `shenron-mcp-${SPEC.triple}${SPEC.exe}`);
rmSync(mcpSidecar, { force: true });
if (withMcp) copyFileSync(join(release, `shenron-mcp${SPEC.exe}`), mcpSidecar);

// 1c. Editor engine sidecar.
const koharuSidecar = join(binaries, `koharu-sdk-${SPEC.triple}${SPEC.exe}`);
rmSync(koharuSidecar, { force: true });
if (withKoharuSdk) copyFileSync(join(release, `koharu-sdk${SPEC.exe}`), koharuSidecar);

// 1d. Local chat model: the pinned llama.cpp runtime and the digest-checked Shenron adapter,
// installed as resources (`llama/`, `models/`); shenron-server finds them through
// SHENRON_RESOURCE_DIR, which shenron-desktop sets.
const withChatModel = !args.includes("--skip-chat-model");
const chatModelDir = join(binaries, "chat-model");
rmSync(chatModelDir, { recursive: true, force: true });
if (withChatModel) {
  await stageLlamaRuntime(target, join(chatModelDir, "llama"));
  await stageAdapter(adapterSource(args), join(chatModelDir, "models"));
}

// 2. Bundle configuration: the sidecars are declared only for bundling builds. Tauri installs
// them beside the app, where shenron-server finds shenron-mcp and koharu-sdk.
const bundleConfig = join(CRATE, "tauri.bundle.json");
const externalBin = [
  "binaries/shenron-server",
  ...(withMcp ? ["binaries/shenron-mcp"] : []),
  ...(withKoharuSdk ? ["binaries/koharu-sdk"] : []),
];
const resources = withChatModel
  ? { "binaries/chat-model/llama/": "llama/", "binaries/chat-model/models/": "models/" }
  : {};
writeFileSync(bundleConfig, `${JSON.stringify({ bundle: { externalBin, resources } }, null, 2)}\n`);

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
