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
import { copyFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import type { ChatModelEntry, ChatModelState, LocalApiGroupStatus } from "@shenron/api/contract";
import {
  CHAT_ADAPTER,
  CHAT_BASE_MODEL,
  CHAT_MODEL_IDS,
  type ChatModelConfig,
  DEFAULT_CHAT_MODEL_ID,
  GEMMA_MODEL,
  resolveChatModelConfig,
  resolveGemmaConfig,
} from "@shenron/config/chat-model";

import { profileOf, type ServerPaths } from "./config";
import { freePort } from "./front";
import { local as isLocalRequest } from "./koharu";

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

/** The `aphrody` CLI (APHRODY_BIN, else PATH); `null` when absent (installed desktop). */
function aphrodyCli(env: Readonly<Record<string, string | undefined>>): string | null {
  const cli = env.APHRODY_BIN?.trim() || Bun.which("aphrody");
  return !cli || (/[\\/]/.test(cli) && !isFile(cli)) ? null : cli;
}

/**
 * Path of a catalog model in the Aphrody store, through the `aphrody` CLI (aphrody-models);
 * `mustExist: false` returns where a pull would put it.
 */
async function aphrodyStorePath(
  env: Readonly<Record<string, string | undefined>>,
  id: string,
  mustExist = true,
): Promise<string | null> {
  const cli = aphrodyCli(env);
  if (!cli) return null;
  try {
    const child = Bun.spawn([cli, "model", "path", id], {
      stdio: ["ignore", "pipe", "ignore"],
      env: { ...env },
      windowsHide: true,
      timeout: 10_000,
    });
    const [out, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
    const path = out.trim().split("\n").at(-1)?.trim();
    return code === 0 && path && (!mustExist || isFile(path)) ? path : null;
  } catch {
    return null;
  }
}

/**
 * Pull a catalog model with `aphrody model pull` (resumed, digest pinned by the catalog) into
 * the store under `aphrodyHome` (`<SHENRON_HOME>/models/aphrody`); progress is the size of
 * its `.part` file. `null` when the CLI is absent or the pull fails.
 */
export async function aphrodyPull(
  env: Readonly<Record<string, string | undefined>>,
  id: string,
  aphrodyHome: string,
  o: { total?: number; onProgress?: (progress: DownloadProgress) => void } = {},
): Promise<string | null> {
  const cli = aphrodyCli(env);
  if (!cli) return null;
  const childEnv = { ...env, APHRODY_HOME: aphrodyHome };
  const target = await aphrodyStorePath(childEnv, id, false);
  if (!target) return null;
  const child = Bun.spawn([cli, "model", "pull", id, "--json"], {
    stdio: ["ignore", "ignore", "ignore"],
    env: childEnv,
    windowsHide: true,
  });
  const timer = setInterval(() => {
    const part = `${target}.part`;
    if (isFile(part)) o.onProgress?.({ received: statSync(part).size, total: o.total ?? null });
  }, 1_000);
  try {
    return (await child.exited) === 0 && isFile(target) ? target : null;
  } finally {
    clearInterval(timer);
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

type SlotState = "pending" | "downloading" | "ready" | "installable" | "failed";

/** One model of the router: its files, then its state on this machine. */
interface Slot {
  id: string;
  label: string;
  state: SlotState;
  progress: DownloadProgress | null;
  detail: string | null;
  model: string | null;
  lora: string | null;
}

export interface ChatModel {
  url: string;
  /** Chat group status: the default model's step until it answers, then what it serves. */
  status(): LocalApiGroupStatus;
  /** Selectable models with their state (`ModelsResponse.models`). */
  catalog(): Promise<ChatModelEntry[]>;
  /** Download a model that is `installable` (or `failed`); resolves when it is served. */
  install(id: string): Promise<boolean>;
  /**
   * Import the Shenron adapter from a file the user chose (no public source): digest-checked,
   * copied into `<home>/models/`, then served.
   */
  importAdapter(path: string): Promise<{ ok: boolean; error?: string }>;
  /**
   * `GET /api/local/models`, `POST /api/local/models/{id}/install` and
   * `POST /api/local/models/shenron-chat-v2/import` (`{ "path": "<adapter.gguf>" }`); the
   * writes answer this machine only (loopback peer and host).
   */
  handle(request: Request, url: URL, peer?: string | null): Promise<Response | null>;
  /** Resolves once the default model answers (`true`) or failed (`false`). */
  ready: Promise<boolean>;
  stop(): void;
}

export const INSTALL_PATH = (id: string) => `/api/local/models/${encodeURIComponent(id)}/install`;
export const IMPORT_PATH = (id: string) => `/api/local/models/${encodeURIComponent(id)}/import`;

const percent = (p: DownloadProgress | null) =>
  p?.total ? ` (${Math.floor((p.received / p.total) * 100)} %)` : "";

/** llama-server router presets (one section per model, loaded on demand). */
export function routerPresets(
  slots: readonly Pick<Slot, "id" | "model" | "lora">[],
  ctx: number,
): string {
  return slots
    .filter((slot) => slot.model)
    .map((slot) =>
      [
        `[${slot.id}]`,
        `model = ${slot.model}`,
        ...(slot.lora ? [`lora = ${slot.lora}`] : []),
        `ctx-size = ${ctx}`,
        "",
      ].join("\n"),
    )
    .join("\n");
}

/**
 * Provision the models, run one `llama-server` in router mode over every model on disk
 * (restarted when another model finishes downloading) and follow it, in the background.
 */
export function startChatModel(
  plan: ChatModelPlan,
  env: Readonly<Record<string, string | undefined>>,
  o: { fetch?: typeof fetch; readyTimeoutMs?: number } = {},
): ChatModel {
  const { config } = plan;
  const gemma = resolveGemmaConfig(env);
  const shenron: Slot = {
    id: CHAT_MODEL_IDS.shenron,
    label: `${CHAT_BASE_MODEL.label} + ${CHAT_ADAPTER.id}`,
    state: "pending",
    progress: null,
    detail: null,
    model: null,
    lora: null,
  };
  const gemmaSlot: Slot | null =
    gemma.mode === "off"
      ? null
      : {
          id: GEMMA_MODEL.id,
          label: GEMMA_MODEL.label,
          state: "pending",
          progress: null,
          detail: null,
          model: null,
          lora: null,
        };
  const slots = [shenron, ...(gemmaSlot ? [gemmaSlot] : [])];
  /** Where the server's own downloader puts Gemma 4 E2B (declared to the router in advance). */
  const gemmaPath = join(plan.modelsDir, GEMMA_MODEL.file);
  let router: ReturnType<typeof Bun.spawn> | null = null;
  let routerUp = false;
  let stopped = false;
  const alive = () => router !== null && router.exitCode === null && router.signalCode === null;
  const kill = async () => {
    routerUp = false;
    if (alive()) {
      router!.kill();
      await router!.exited;
    }
  };
  const stop = () => {
    stopped = true;
    routerUp = false;
    if (alive()) router!.kill();
  };
  process.once("exit", stop);

  const download = async (
    slot: Slot,
    source: {
      url: string | null;
      sha256: string | null;
      file: string;
      /** aphrody-models catalog id of the same pinned file: pulled by Aphrody when it is here. */
      catalog?: { id: string; url: string; bytes: number };
    },
  ): Promise<string | null> => {
    if (!source.url) return null;
    slot.state = "downloading";
    slot.progress = null;
    if (source.catalog && source.url === source.catalog.url) {
      const pulled = await aphrodyPull(env, source.catalog.id, join(plan.modelsDir, "aphrody"), {
        total: source.catalog.bytes,
        onProgress: (progress) => {
          slot.progress = progress;
        },
      });
      if (pulled) return pulled;
    }
    return downloadArtifact(source.url, join(plan.modelsDir, source.file), {
      sha256: source.sha256,
      onProgress: (progress) => {
        slot.progress = progress;
      },
      ...(o.fetch ? { fetch: o.fetch } : {}),
    });
  };
  /** A catalog model in the user's Aphrody store (used in place), then in SHENRON_HOME's. */
  const inStores = async (id: string): Promise<string | null> =>
    (await aphrodyStorePath(env, id)) ??
    (await aphrodyStorePath({ ...env, APHRODY_HOME: join(plan.modelsDir, "aphrody") }, id));
  const fail = (slot: Slot, detail: string) => {
    slot.state = "failed";
    slot.detail = detail;
    slot.progress = null;
  };

  /** (Re)start the router over the models on disk and wait for its /health. */
  const startRouter = async (): Promise<boolean> => {
    await kill();
    if (stopped || !plan.binary) return false;
    const presets = join(plan.modelsDir, "llama-presets.ini");
    mkdirSync(plan.modelsDir, { recursive: true });
    mkdirSync(join(plan.logFile, ".."), { recursive: true });
    await Bun.write(
      presets,
      routerPresets(
        [
          ...slots.filter((slot) => slot.state === "ready"),
          // Gemma 4 E2B still downloading is declared at its final path: the router loads it on
          // demand once the file is there, so the end of its download never restarts the router
          // (which would unload and reload the default model).
          ...(gemmaSlot && gemmaSlot.state !== "ready" ? [{ ...gemmaSlot, model: gemmaPath }] : []),
        ],
        config.ctx,
      ),
    );
    router = Bun.spawn(
      [
        plan.binary,
        "--models-preset",
        presets,
        // One model in memory at a time: switching unloads the other.
        "--models-max",
        "1",
        "--host",
        "127.0.0.1",
        "--port",
        String(plan.port),
        "--no-webui",
      ],
      { env: { ...env }, stdio: ["ignore", "ignore", Bun.file(plan.logFile)], windowsHide: true },
    );
    const deadline = Date.now() + (o.readyTimeoutMs ?? 300_000);
    const poll = async (): Promise<boolean> => {
      if (stopped || Date.now() >= deadline) return false;
      if (!alive()) return false;
      const ok = await fetch(`${plan.url}/health`, { signal: AbortSignal.timeout(1_000) }).then(
        (response) => response.ok,
        () => false,
      );
      if (ok) return true;
      await Bun.sleep(250);
      return poll();
    };
    routerUp = await poll();
    if (!routerUp && !stopped) {
      const reason = alive()
        ? "le serveur de modèles n'a pas démarré à temps"
        : `llama-server arrêté (code ${router.exitCode ?? router.signalCode})`;
      for (const slot of slots) if (slot.state === "ready") fail(slot, reason);
      await kill();
    }
    return routerUp;
  };

  /** Load the default model now (the router would on the first request) and check its adapter. */
  const warmUp = async () => {
    const load = await fetch(`${plan.url}/models/load`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: shenron.id }),
    }).catch(() => null);
    if (!load) return;
    const deadline = Date.now() + (o.readyTimeoutMs ?? 300_000);
    const loaded = async (): Promise<boolean> => {
      if (stopped || Date.now() >= deadline || !alive()) return false;
      const states = await routerStates();
      if (states.get(shenron.id) === "loaded") return true;
      await Bun.sleep(250);
      return loaded();
    };
    if ((await loaded()) && shenron.lora && !(await loraApplied(plan.url, shenron.id)))
      shenron.detail = "adaptateur chargé sans être appliqué";
  };

  /** Router status of each model (`loaded`, `loading`, `unloaded`, `failed`). */
  const routerStates = async (): Promise<Map<string, string>> => {
    const states = new Map<string, string>();
    if (!routerUp) return states;
    try {
      const response = await fetch(`${plan.url}/v1/models`, { signal: AbortSignal.timeout(2_000) });
      const body = (await response.json()) as {
        data?: { id: string; status?: { value?: string } }[];
      };
      for (const model of body.data ?? []) states.set(model.id, model.status?.value ?? "unloaded");
    } catch {
      // the router is restarting
    }
    return states;
  };

  const provisionShenron = async (): Promise<boolean> => {
    if (config.modelPath && !isFile(config.modelPath)) {
      fail(shenron, "SHENRON_CHAT_MODEL ne désigne aucun fichier");
      return false;
    }
    const base =
      [config.modelPath, join(plan.modelsDir, CHAT_BASE_MODEL.file)].find(isFile) ??
      (await inStores(CHAT_BASE_MODEL.id)) ??
      (await download(shenron, {
        url: config.modelUrl,
        sha256: config.modelSha256,
        file: CHAT_BASE_MODEL.file,
        catalog: { id: CHAT_BASE_MODEL.id, url: CHAT_BASE_MODEL.url, bytes: CHAT_BASE_MODEL.bytes },
      }));
    if (!base) {
      fail(shenron, "modèle de chat introuvable");
      return false;
    }
    const lora = config.lora
      ? ([
          config.loraPath,
          join(plan.modelsDir, CHAT_ADAPTER.file),
          ...plan.shippedDirs.map((dir) => join(dir, "models", CHAT_ADAPTER.file)),
          env.APHRODY_SHENRON_CHAT_LORA?.trim(),
        ].find(isFile) ??
        (await download(shenron, {
          url: config.loraUrl,
          sha256: config.loraSha256,
          file: CHAT_ADAPTER.file,
        })))
      : null;
    shenron.model = base;
    shenron.lora = lora;
    if (!lora) shenron.label = `${CHAT_BASE_MODEL.label} (sans adaptateur)`;
    if (!lora && config.lora)
      shenron.detail = `adaptateur ${CHAT_ADAPTER.id} introuvable : importez son fichier`;
    shenron.state = "ready";
    shenron.progress = null;
    return true;
  };

  /** Gemma 4 E2B already on disk (explicit path, SHENRON_HOME, the Aphrody store). */
  const findGemma = async (): Promise<string | null> =>
    [gemma.path, join(plan.modelsDir, GEMMA_MODEL.file)].find(isFile) ??
    (await inStores(GEMMA_MODEL.aphrodyId));

  let installing: Promise<boolean> | null = null;
  const install = (id: string): Promise<boolean> => {
    if (!gemmaSlot || id !== gemmaSlot.id) return Promise.resolve(false);
    if (gemmaSlot.state === "ready") return Promise.resolve(true);
    installing ??= (async () => {
      try {
        const path = await download(gemmaSlot, {
          url: gemma.url,
          sha256: gemma.sha256,
          file: GEMMA_MODEL.file,
          catalog: { id: GEMMA_MODEL.aphrodyId, url: GEMMA_MODEL.url, bytes: GEMMA_MODEL.bytes },
        });
        if (!path) {
          fail(gemmaSlot, "aucune source de téléchargement");
          return false;
        }
        gemmaSlot.model = path;
        gemmaSlot.state = "ready";
        gemmaSlot.progress = null;
        gemmaSlot.detail = null;
        // The router reads its presets at start: it already knows the file at gemmaPath;
        // a model found elsewhere (the Aphrody store) needs a restart with the new presets.
        if (path !== gemmaPath || !routerUp || !alive()) {
          if (shenron.state === "ready" && (await startRouter())) await warmUp();
        }
        return gemmaSlot.state === "ready";
      } catch (error) {
        fail(gemmaSlot, `téléchargement : ${String(error).slice(0, 160)}`);
        return false;
      } finally {
        installing = null;
      }
    })();
    return installing;
  };

  const importAdapter = async (path: string): Promise<{ ok: boolean; error?: string }> => {
    if (!isFile(path)) return { ok: false, error: "no such file" };
    if (config.loraSha256) {
      const hasher = new Bun.CryptoHasher("sha256");
      for await (const chunk of Bun.file(path).stream()) hasher.update(chunk);
      if (hasher.digest("hex") !== config.loraSha256)
        return { ok: false, error: `not the ${CHAT_ADAPTER.id} adapter (SHA-256 differs)` };
    }
    mkdirSync(plan.modelsDir, { recursive: true });
    const dest = join(plan.modelsDir, CHAT_ADAPTER.file);
    if (path !== dest) copyFileSync(path, dest);
    shenron.lora = dest;
    shenron.label = `${CHAT_BASE_MODEL.label} + ${CHAT_ADAPTER.id}`;
    shenron.detail = null;
    if (shenron.state === "ready" && (await startRouter())) await warmUp();
    return { ok: true };
  };

  const run = async (): Promise<boolean> => {
    if (!plan.binary) {
      for (const slot of slots)
        fail(slot, "llama-server absent : modèle de chat local indisponible");
      return false;
    }
    if (gemmaSlot) {
      const found = await findGemma();
      if (found) {
        gemmaSlot.model = found;
        gemmaSlot.state = "ready";
      } else gemmaSlot.state = "installable";
    }
    if (!(await provisionShenron()) || stopped) return false;
    if (!(await startRouter())) return false;
    await warmUp();
    // Gemma 4 E2B follows the default model on the first launch (`manual`: on request).
    if (gemmaSlot?.state === "installable" && gemma.mode === "auto") void install(gemmaSlot.id);
    return shenron.state === "ready" && routerUp;
  };

  const ready = run().catch((error: unknown) => {
    fail(shenron, `modèle de chat : ${String(error).slice(0, 160)}`);
    return false;
  });
  ready.then((ok) =>
    console.error(
      JSON.stringify({ event: ok ? "shenron.chat_model.ready" : "shenron.chat_model.failed" }),
    ),
  );

  const entryOf = (slot: Slot, states: Map<string, string>): ChatModelEntry => {
    const routed = states.get(slot.id);
    const state: ChatModelState =
      slot.state === "ready"
        ? !routerUp || !alive()
          ? "loading"
          : routed === "loading"
            ? "loading"
            : routed === "failed"
              ? "failed"
              : "ready"
        : slot.state === "pending"
          ? "loading"
          : slot.state;
    return {
      id: slot.id,
      label: slot.label,
      backend: "local",
      available: state === "ready" || (state === "loading" && slot.state === "ready" && routerUp),
      default: slot.id === DEFAULT_CHAT_MODEL_ID,
      remote: false,
      state,
      ...(slot.progress ? { progress: { ...slot.progress } } : {}),
      ...(state === "installable" || (state === "failed" && slot.id !== shenron.id)
        ? { installUrl: INSTALL_PATH(slot.id) }
        : {}),
      ...(slot.id === shenron.id && config.lora && !slot.lora && slot.state === "ready"
        ? { importUrl: IMPORT_PATH(slot.id) }
        : {}),
      ...(slot.detail ? { detail: slot.detail } : {}),
    };
  };
  const catalog = async () => {
    const states = await routerStates();
    return slots.map((slot) => entryOf(slot, states));
  };

  return {
    url: plan.url,
    ready,
    stop,
    catalog,
    install,
    importAdapter,
    async handle(request, url, peer = null) {
      const headers = { "cache-control": "no-store" };
      if (url.pathname === "/api/local/models" && request.method === "GET")
        return Response.json({ models: await catalog() }, { headers });
      const match = /^\/api\/local\/models\/([^/]+)\/(install|import)$/.exec(url.pathname);
      if (!match) return null;
      if (request.method !== "POST")
        return Response.json({ error: "POST only" }, { status: 405, headers });
      if (!isLocalRequest(request, url, peer))
        return Response.json({ error: "this machine only" }, { status: 403, headers });
      const id = decodeURIComponent(match[1]!);
      if (match[2] === "import") {
        if (id !== shenron.id)
          return Response.json({ error: "unknown adapter" }, { status: 404, headers });
        const body = (await request.json().catch(() => null)) as { path?: unknown } | null;
        if (typeof body?.path !== "string" || !body.path.trim())
          return Response.json({ error: "path is required" }, { status: 400, headers });
        const result = await importAdapter(body.path.trim());
        return Response.json(
          result.ok ? (await catalog()).find((e) => e.id === id) : { error: result.error },
          { status: result.ok ? 200 : 422, headers },
        );
      }
      if (!slots.some((slot) => slot.id === id && slot.id !== shenron.id))
        return Response.json({ error: "unknown model" }, { status: 404, headers });
      void install(id);
      const entry = (await catalog()).find((e) => e.id === id);
      return Response.json(entry, { status: 202, headers });
    },
    status(): LocalApiGroupStatus {
      const extra = gemmaSlot
        ? gemmaSlot.state === "downloading"
          ? ` ; ${gemmaSlot.id} : téléchargement${percent(gemmaSlot.progress)}`
          : gemmaSlot.state === "ready"
            ? ` ; ${gemmaSlot.id}`
            : ""
        : "";
      if (shenron.state === "ready" && routerUp && alive())
        return { available: true, reason: `${shenron.label}${extra}` };
      if (shenron.state === "ready" && routerUp)
        return { available: false, reason: "modèle de chat local arrêté" };
      switch (shenron.state) {
        case "downloading":
          return {
            available: false,
            reason: `téléchargement du modèle${percent(shenron.progress)}`,
          };
        case "failed":
          return { available: false, reason: shenron.detail ?? "modèle de chat indisponible" };
        default:
          return { available: false, reason: "chargement du modèle de chat" };
      }
    },
  };
}

/** `true` when llama-server reports an adapter of `model` loaded with a non-zero scale. */
async function loraApplied(url: string, model: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/lora-adapters?model=${encodeURIComponent(model)}`, {
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) return false;
    const adapters = (await response.json()) as { scale?: number }[];
    return Array.isArray(adapters) && adapters.some((adapter) => (adapter.scale ?? 0) > 0);
  } catch {
    return false;
  }
}
