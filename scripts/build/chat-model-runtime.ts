#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Stage what Shenron Studio ships for its local chat model: the pinned llama.cpp release
 * (`llama-server` and its libraries, Vulkan build) and the Shenron LoRA adapter
 * (`shenron-chat-v2`, digest-checked). The base model (2.5 GB) is not shipped: shenron-server
 * downloads it once into SHENRON_HOME on first launch (`apps/server/src/chat-model.ts`).
 *
 *   bun scripts/build/chat-model-runtime.ts --target windows-x64|linux-x64 --out <dir>
 *                                           [--chat-lora <adapter.gguf>]
 *
 * Writes `<out>/llama/` and `<out>/models/shenron-chat-v2.gguf`. The adapter comes from
 * --chat-lora, SHENRON_CHAT_LORA or APHRODY_SHENRON_CHAT_LORA (Aphrody training output); the
 * weights never enter Git. Downloads are cached under `target/llama-runtime/`.
 */
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import {
  CHAT_ADAPTER,
  LLAMA_RUNTIME,
  llamaRuntimeUrl,
} from "../../packages/config/src/chat-model.ts";

const ROOT = resolve(import.meta.dir, "../..");
export type DesktopTarget = keyof typeof LLAMA_RUNTIME.assets;

async function sha256File(path: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  for await (const chunk of Bun.file(path).stream()) hasher.update(chunk);
  return hasher.digest("hex");
}

/** Every file under `dir` (recursive). */
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

/** Libraries of the other llama.cpp tools, which `llama-server` does not load. */
const OTHER_TOOLS = /(batched-bench|bench|cli|completion|perplexity|quantize)-impl\./;

/**
 * Files of a llama.cpp release that `llama-server` needs: itself, its libraries, the licence.
 * Linux libraries ship once, under their soname (`libggml.so.0`): the development link
 * (`libggml.so`) and the fully versioned file are left out.
 */
export function isRuntimeFile(name: string, symlink = false): boolean {
  if (OTHER_TOOLS.test(name)) return false;
  if (/^llama-server(\.exe)?$/.test(name) || /^LICENSE/.test(name)) return true;
  if (/\.(dll|dylib)$/.test(name)) return true;
  if (/\.so\.\d+$/.test(name)) return true;
  if (/\.so$/.test(name)) return !symlink;
  return false;
}

/** Download (cached, digest-checked) and extract the pinned llama.cpp release into `dest`. */
export async function stageLlamaRuntime(target: DesktopTarget, dest: string): Promise<string[]> {
  const asset = LLAMA_RUNTIME.assets[target];
  const cache = join(ROOT, "target/llama-runtime", LLAMA_RUNTIME.tag);
  const archive = join(cache, asset.name);
  mkdirSync(cache, { recursive: true });
  if (!existsSync(archive) || (await sha256File(archive)) !== asset.sha256) {
    const response = await fetch(llamaRuntimeUrl(asset.name), { redirect: "follow" });
    if (!response.ok) throw new Error(`${asset.name}: HTTP ${response.status}`);
    await Bun.write(`${archive}.part`, response);
    const digest = await sha256File(`${archive}.part`);
    if (digest !== asset.sha256) throw new Error(`${asset.name}: digest mismatch (${digest})`);
    rmSync(archive, { force: true });
    copyFileSync(`${archive}.part`, archive);
    rmSync(`${archive}.part`, { force: true });
  }
  const unpacked = join(cache, `${target}-unpacked`);
  rmSync(unpacked, { recursive: true, force: true });
  mkdirSync(unpacked, { recursive: true });
  if (asset.name.endsWith(".zip")) {
    const unzip = Bun.spawnSync(["unzip", "-q", "-o", archive, "-d", unpacked]);
    if (unzip.exitCode !== 0) throw new Error(`unzip ${asset.name} failed`);
  } else {
    await new Bun.Archive(await Bun.file(archive).bytes()).extract(unpacked);
  }
  const server = walk(unpacked).find((path) => /^llama-server(\.exe)?$/.test(basename(path)));
  if (!server) throw new Error(`${asset.name}: no llama-server inside`);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  const files = readdirSync(dirname(server)).filter((name) =>
    isRuntimeFile(name, lstatSync(join(dirname(server), name)).isSymbolicLink()),
  );
  // copyFileSync follows the release's library symlinks: each name becomes a plain file.
  for (const name of files) copyFileSync(join(dirname(server), name), join(dest, name));
  return files.toSorted();
}

/** Copy the digest-checked adapter to `<dest>/shenron-chat-v2.gguf`. */
export async function stageAdapter(source: string | undefined, dest: string): Promise<string> {
  if (!source || !existsSync(source) || !statSync(source).isFile())
    throw new Error(
      `${CHAT_ADAPTER.id}: adapter not found; pass --chat-lora <adapter.gguf> or set ` +
        "APHRODY_SHENRON_CHAT_LORA (or build with --skip-chat-model)",
    );
  const digest = await sha256File(source);
  if (digest !== CHAT_ADAPTER.sha256)
    throw new Error(`${CHAT_ADAPTER.id}: ${source} is not the pinned adapter (${digest})`);
  mkdirSync(dest, { recursive: true });
  const out = join(dest, CHAT_ADAPTER.file);
  copyFileSync(source, out);
  return out;
}

/** The adapter source of a build: --chat-lora, SHENRON_CHAT_LORA, APHRODY_SHENRON_CHAT_LORA. */
export function adapterSource(args: readonly string[]): string | undefined {
  const index = args.indexOf("--chat-lora");
  return (
    (index >= 0 ? args[index + 1] : undefined) ??
    process.env.SHENRON_CHAT_LORA?.trim() ??
    process.env.APHRODY_SHENRON_CHAT_LORA?.trim()
  );
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const value = (flag: string) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const target = (value("--target") ?? "linux-x64") as DesktopTarget;
  if (!(target in LLAMA_RUNTIME.assets)) throw new Error("--target windows-x64|linux-x64");
  const out = resolve(value("--out") ?? join(ROOT, "target/chat-model", target));
  const runtime = await stageLlamaRuntime(target, join(out, "llama"));
  const adapter = await stageAdapter(adapterSource(args), join(out, "models"));
  console.log(JSON.stringify({ target, out, runtime, adapter }));
}
