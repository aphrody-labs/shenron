// SPDX-License-Identifier: Apache-2.0
/**
 * The local chat model of `shenron-server` (Shenron Studio): Qwen3-4B Instruct 2507 with the
 * Shenron LoRA adapter `shenron-chat-v2`, served by a `llama-server` child on a loopback port
 * (OpenAI-compatible, `APHRODY_LOCAL_MODEL_URL` of the chat backend). Pinned sources, digests
 * and defaults live in `@shenron/config/chat-model`.
 *
 *   llama-server  SHENRON_LLAMA_BIN, APHRODY_LLAMA_BIN, `llama/` shipped beside the app
 *                 (SHENRON_RESOURCE_DIR, then the executable's directory), then PATH
 *   base GGUF     SHENRON_CHAT_MODEL (a path), `<home>/models/`, the Aphrody model store
 *                 (`aphrody model path <id>`, used in place), else downloaded once from
 *                 SHENRON_CHAT_MODEL_URL into `<home>/models/` (resumed, digest-checked)
 *   adapter       SHENRON_CHAT_LORA (a path, `off` for the base only), `<home>/models/`,
 *                 `models/` shipped beside the app, APHRODY_SHENRON_CHAT_LORA (Aphrody
 *                 training output), else SHENRON_CHAT_LORA_URL when declared
 *
 * Nothing blocks the server: provisioning and loading run in the background and the chat
 * group reports the step (download progress, loading, failure) until the model answers.
 */
import { existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import type { LocalApiGroupStatus } from "@shenron/api/contract";
import {
  CHAT_ADAPTER,
  CHAT_BASE_MODEL,
  type ChatModelConfig,
  resolveChatModelConfig,
} from "@shenron/config/chat-model";

import { profileOf, type ServerPaths } from "./config";
import { freePort } from "./front";

const exe = (name: string) => (process.platform === "win32" ? `${name}.exe` : name);
const isFile = (path: string | undefined | null): path is string =>
  Boolean(path) && existsSync(path!) && statSync(path!).isFile();
const isDir = (path: string): boolean => existsSync(path) && statSync(path).isDirectory();

/** Variables that already point the chat at a server: no managed model then. */
const EXTERNAL_CHAT_URLS = [
  "APHRODY_AI_CHAT_BASE_URL",
  "APHRODY_SHENRON_LLM_BASE_URL",
  "APHRODY_LOCAL_MODEL_URL",
] as const;

export interface ChatModelPlan {
  config: ChatModelConfig;
  /** `llama-server` to run; `null` when none is installed (the chat group says so). */
  binary: string | null;
  /** Loopback origin the server will listen on (`APHRODY_LOCAL_MODEL_URL`). */
  url: string;
  port: number;
  modelsDir: string;
  logFile: string;
  /** Directories of the files shipped with the app (`llama/`, `models/`). */
  shippedDirs: string[];
}

/** Directories shipped beside the app: SHENRON_RESOURCE_DIR (Tauri resources), the executable's. */
export function shippedDirs(
  paths: Pick<ServerPaths, "exeDir">,
  env: Readonly<Record<string, string | undefined>>,
): string[] {
  const dirs = [env.SHENRON_RESOURCE_DIR?.trim(), paths.exeDir].filter((dir): dir is string =>
    Boolean(dir),
  );
  return [...new Set(dirs)];
}

/** The `llama-server` to run: explicit (file or directory), shipped, then PATH. */
export function resolveLlamaServer(
  explicit: string | null,
  dirs: readonly string[],
  which: (name: string) => string | null = (name) => Bun.which(name),
): string | null {
  const name = exe("llama-server");
  if (explicit) {
    if (isFile(explicit)) return explicit;
    if (isDir(explicit)) {
      const inside = [join(explicit, name), join(explicit, "bin", name)].find(isFile);
      if (inside) return inside;
    }
  }
  for (const dir of dirs) {
    const found = [join(dir, "llama", name), join(dir, name), join(dir, "binaries", name)].find(
      isFile,
    );
    if (found) return found;
  }
  return which("llama-server");
}

/** Resolve what the managed chat model runs on; `null` when it is off or the chat is external. */
export function planChatModel(
  paths: ServerPaths,
  env: Readonly<Record<string, string | undefined>>,
): ChatModelPlan | null {
  const config = resolveChatModelConfig(env, profileOf(env));
  if (!config.enabled || EXTERNAL_CHAT_URLS.some((name) => env[name]?.trim())) return null;
  // Only for the `local` chat backend (the default outside production).
  const backends = (env.SHENRON_CHAT_BACKENDS ?? "local").split(",").map((id) => id.trim());
  if (!backends.includes("local")) return null;
  const dirs = shippedDirs(paths, env);
  const port = freePort();
  return {
    config,
    binary: resolveLlamaServer(config.llamaBin, dirs, (name) =>
      Bun.which(name, env.PATH === undefined ? {} : { PATH: env.PATH }),
    ),
    url: `http://127.0.0.1:${port}`,
    port,
    modelsDir: join(paths.home, "models"),
    logFile: join(paths.logs, "llama-server.log"),
    shippedDirs: dirs,
  };
}

/** Path of a catalog model in the Aphrody store, through the `aphrody` CLI (aphrody-models). */
async function aphrodyStorePath(
  env: Readonly<Record<string, string | undefined>>,
  id: string,
): Promise<string | null> {
  const cli = env.APHRODY_BIN?.trim() || Bun.which("aphrody");
  if (!cli || (/[\\/]/.test(cli) && !isFile(cli))) return null;
  try {
    const child = Bun.spawn([cli, "model", "path", id], {
      stdio: ["ignore", "pipe", "ignore"],
      env: { ...env },
      windowsHide: true,
      timeout: 10_000,
    });
    const [out, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
    const path = out.trim().split("\n").at(-1)?.trim();
    return code === 0 && isFile(path) ? path : null;
  } catch {
    return null;
  }
}

export interface DownloadProgress {
  received: number;
  total: number | null;
}

/**
 * Download `url` into `dest` through `dest.part`, resuming a partial file with a Range request;
 * the digest, when given, is checked before the file takes its final name.
 */
export async function downloadArtifact(
  url: string,
  dest: string,
  o: {
    sha256?: string | null;
    onProgress?: (progress: DownloadProgress) => void;
    fetch?: typeof fetch;
  } = {},
): Promise<string> {
  mkdirSync(join(dest, ".."), { recursive: true });
  const part = `${dest}.part`;
  let offset = isFile(part) ? statSync(part).size : 0;
  const response = await (o.fetch ?? fetch)(url, {
    headers: offset ? { Range: `bytes=${offset}-` } : {},
    redirect: "follow",
  });
  if (response.status === 200) offset = 0;
  else if (response.status !== 206 || !response.body)
    throw new Error(`download failed: HTTP ${response.status}`);
  const length = Number(response.headers.get("content-length"));
  const total = Number.isFinite(length) && length > 0 ? offset + length : null;
  const hasher = new Bun.CryptoHasher("sha256");
  if (offset && o.sha256) {
    for await (const chunk of Bun.file(part).stream()) hasher.update(chunk);
  }
  const handle = await open(part, offset ? "a" : "w");
  let received = offset;
  try {
    for await (const chunk of response.body!) {
      await handle.write(chunk);
      if (o.sha256) hasher.update(chunk);
      received += chunk.byteLength;
      o.onProgress?.({ received, total });
    }
  } finally {
    await handle.close();
  }
  if (o.sha256) {
    const digest = hasher.digest("hex");
    if (digest !== o.sha256) {
      await Bun.file(part).delete();
      throw new Error(`digest mismatch for ${url}`);
    }
  }
  renameSync(part, dest);
  return dest;
}

type Phase =
  | { kind: "provisioning"; what: string; progress: DownloadProgress | null }
  | { kind: "loading" }
  | { kind: "ready"; lora: boolean }
  | { kind: "failed"; reason: string };

export interface ChatModel {
  url: string;
  /** Chat group status: the step until the model answers, then what it serves. */
  status(): LocalApiGroupStatus;
  /** Resolves once the model answers (`true`) or failed (`false`). */
  ready: Promise<boolean>;
  stop(): void;
}

const percent = (p: DownloadProgress | null) =>
  p?.total ? ` (${Math.floor((p.received / p.total) * 100)} %)` : "";

/** Provision the files, start `llama-server` with the adapter and follow it (background). */
export function startChatModel(
  plan: ChatModelPlan,
  env: Readonly<Record<string, string | undefined>>,
  o: { fetch?: typeof fetch; readyTimeoutMs?: number } = {},
): ChatModel {
  let phase: Phase = { kind: "loading" };
  let child: ReturnType<typeof Bun.spawn> | null = null;
  let stopped = false;
  const alive = () => child !== null && child.exitCode === null && child.signalCode === null;
  const stop = () => {
    stopped = true;
    if (alive()) child!.kill();
  };
  process.once("exit", stop);

  const provision = async (
    what: string,
    candidates: (string | null | undefined)[],
    source: { url: string | null; sha256: string | null; file: string },
  ): Promise<string | null> => {
    const found = candidates.find((candidate) => isFile(candidate));
    if (found) return found;
    if (!source.url) return null;
    phase = { kind: "provisioning", what, progress: null };
    return downloadArtifact(source.url, join(plan.modelsDir, source.file), {
      sha256: source.sha256,
      onProgress: (progress) => {
        phase = { kind: "provisioning", what, progress };
      },
      ...(o.fetch ? { fetch: o.fetch } : {}),
    });
  };

  const run = async (): Promise<boolean> => {
    const { config } = plan;
    if (!plan.binary) {
      phase = { kind: "failed", reason: "llama-server absent : modèle de chat local indisponible" };
      return false;
    }
    if (config.modelPath && !isFile(config.modelPath)) {
      phase = { kind: "failed", reason: "SHENRON_CHAT_MODEL ne désigne aucun fichier" };
      return false;
    }
    const base = await provision(
      "modèle",
      [
        config.modelPath,
        join(plan.modelsDir, CHAT_BASE_MODEL.file),
        await aphrodyStorePath(env, CHAT_BASE_MODEL.id),
      ],
      { url: config.modelUrl, sha256: config.modelSha256, file: CHAT_BASE_MODEL.file },
    );
    if (!base) {
      phase = { kind: "failed", reason: "modèle de chat introuvable" };
      return false;
    }
    const lora = config.lora
      ? await provision(
          "adaptateur",
          [
            config.loraPath,
            join(plan.modelsDir, CHAT_ADAPTER.file),
            ...plan.shippedDirs.map((dir) => join(dir, "models", CHAT_ADAPTER.file)),
            env.APHRODY_SHENRON_CHAT_LORA?.trim(),
          ],
          { url: config.loraUrl, sha256: config.loraSha256, file: CHAT_ADAPTER.file },
        )
      : null;
    if (stopped) return false;
    phase = { kind: "loading" };
    mkdirSync(join(plan.logFile, ".."), { recursive: true });
    child = Bun.spawn(
      [
        plan.binary,
        "--model",
        base,
        ...(lora ? ["--lora", lora] : []),
        "--alias",
        CHAT_BASE_MODEL.id,
        "--host",
        "127.0.0.1",
        "--port",
        String(plan.port),
        "--ctx-size",
        String(config.ctx),
        "--parallel",
        "1",
        "--no-webui",
      ],
      {
        env: { ...env },
        stdio: ["ignore", "ignore", Bun.file(plan.logFile)],
        windowsHide: true,
      },
    );
    const deadline = Date.now() + (o.readyTimeoutMs ?? 300_000);
    // Sequential polling until /health answers 200 (503 while the weights load).
    const poll = async (): Promise<boolean | null> => {
      if (stopped || Date.now() >= deadline) return null;
      if (!alive()) {
        phase = {
          kind: "failed",
          reason: `llama-server arrêté (code ${child!.exitCode ?? child!.signalCode})`,
        };
        return false;
      }
      const ok = await fetch(`${plan.url}/health`, { signal: AbortSignal.timeout(1_000) }).then(
        (response) => response.ok,
        () => false,
      );
      if (ok) {
        phase = { kind: "ready", lora: Boolean(lora) && (await loraApplied(plan.url)) };
        return true;
      }
      await Bun.sleep(250);
      return poll();
    };
    const outcome = await poll();
    if (outcome !== null) return outcome;
    if (!stopped) phase = { kind: "failed", reason: "le modèle de chat n'a pas démarré à temps" };
    stop();
    return false;
  };

  const ready = run().catch((error: unknown) => {
    phase = { kind: "failed", reason: `modèle de chat : ${String(error).slice(0, 160)}` };
    return false;
  });
  ready.then((ok) =>
    console.error(
      JSON.stringify({ event: ok ? "shenron.chat_model.ready" : "shenron.chat_model.failed" }),
    ),
  );

  return {
    url: plan.url,
    ready,
    stop,
    status(): LocalApiGroupStatus {
      if (phase.kind === "ready" && !alive())
        return { available: false, reason: "modèle de chat local arrêté" };
      switch (phase.kind) {
        case "ready":
          return {
            available: true,
            reason: `${CHAT_BASE_MODEL.label}${phase.lora ? ` + ${CHAT_ADAPTER.id}` : " (sans adaptateur)"}`,
          };
        case "provisioning":
          return {
            available: false,
            reason: `téléchargement du ${phase.what}${percent(phase.progress)}`,
          };
        case "loading":
          return { available: false, reason: "chargement du modèle de chat" };
        case "failed":
          return { available: false, reason: phase.reason };
      }
    },
  };
}

/** `true` when llama-server reports an adapter loaded with a non-zero scale. */
async function loraApplied(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/lora-adapters`, { signal: AbortSignal.timeout(2_000) });
    if (!response.ok) return false;
    const adapters = (await response.json()) as { scale?: number }[];
    return Array.isArray(adapters) && adapters.some((adapter) => (adapter.scale ?? 0) > 0);
  } catch {
    return false;
  }
}
