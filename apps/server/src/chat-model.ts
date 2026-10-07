// SPDX-License-Identifier: Apache-2.0
/**
 * The local chat models of `shenron-server` (Shenron Studio), on Aphrody's local chat
 * (`aphrody-llama-server`, contract `crates/ai/llama-server/LOCAL-CHAT.md`) linked in the native
 * library (`shenron-ffi` ABI 4, `@shenron/native`): nothing of it is reimplemented here.
 *
 *   provisioning  `shenron_llama_provision_job` on the worker pool: catalog ids of
 *                 aphrody-models (pinned revision and digest), resumed and digest-checked
 *                 downloads into the store `<SHENRON_HOME>/models` (`registry.json`)
 *   router        `shenron_llama_router_start`: one OpenAI-compatible endpoint on the loopback
 *                 port of `APHRODY_LOCAL_MODEL_URL`, over `shenron-chat-v2` (Qwen3-4B + the
 *                 Shenron LoRA) and `gemma4-e2b`; one `llama-server` at a time, started on first
 *                 use, `/health` per model
 *   daemon        the supervisor re-executes this server as `llama-daemon` (`main.ts`), so no
 *                 Aphrody executable ships beside it
 *
 * Shenron decides only which files: the base GGUF (SHENRON_CHAT_MODEL path, a file left in
 * `<home>/models/` by an earlier release, SHENRON_CHAT_MODEL_URL, else the catalog id), the
 * adapter (SHENRON_CHAT_LORA, `<home>/models/`, `models/` shipped beside the app,
 * APHRODY_SHENRON_CHAT_LORA, SHENRON_CHAT_LORA_URL), Gemma 4 E2B alike. `llama-server` is
 * SHENRON_LLAMA_BIN, else Aphrody's lookup (APHRODY_LLAMA_BIN, `llama/` in SHENRON_RESOURCE_DIR
 * or beside the executable, Aphrody runtimes, PATH).
 *
 * Nothing blocks the server: provisioning and loading run in the background and the chat
 * group reports the step (download progress, loading, failure) until the model answers.
 */
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
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
import type {
  LlamaProgress,
  LlamaProvisioned,
  LlamaRouterInfo,
  ShenronLlamaArtifact,
  ShenronLlamaProvision,
  ShenronLlamaRouterStart,
} from "@shenron/native/shenron";

import { profileOf, type ServerPaths } from "./config";
import { freePort } from "./front";
import { local as isLocalRequest } from "./koharu";

const isFile = (path: string | undefined | null): path is string =>
  Boolean(path) && existsSync(path!) && statSync(path!).isFile();

/** Variables that already point the chat at a server: no managed model then. */
const EXTERNAL_CHAT_URLS = [
  "APHRODY_AI_CHAT_BASE_URL",
  "APHRODY_SHENRON_LLM_BASE_URL",
  "APHRODY_LOCAL_MODEL_URL",
] as const;

/** Verb of `main.ts` under which the model supervisor re-executes this server as its daemon. */
export const LLAMA_DAEMON_VERB = "llama-daemon";

export interface ChatModelPlan {
  config: ChatModelConfig;
  /** Loopback origin the router listens on (`APHRODY_LOCAL_MODEL_URL`). */
  url: string;
  port: number;
  /** Aphrody model store (`registry.json` and the files). */
  modelsDir: string;
  /** Router configuration and per-model server state. */
  stateDir: string;
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
  const port = freePort();
  return {
    config,
    url: `http://127.0.0.1:${port}`,
    port,
    modelsDir: join(paths.home, "models"),
    stateDir: join(paths.home, "llama"),
    shippedDirs: shippedDirs(paths, env),
  };
}

/** The local chat calls of the native library (`@shenron/native` by default; a fake in tests). */
export interface LocalChatNative {
  provision(
    request: ShenronLlamaProvision,
    onProgress: (progress: LlamaProgress) => void,
    signal: AbortSignal,
  ): Promise<LlamaProvisioned>;
  startRouter(request: ShenronLlamaRouterStart): LlamaRouterInfo;
  stopRouter(): boolean;
}

/**
 * The native library of `libraryPath`, or the reason it is unusable. Loaded lazily so a server
 * without it (tests, a source checkout without the Rust build) still starts.
 */
export async function nativeLocalChat(library: string | null): Promise<LocalChatNative | string> {
  if (!library) return "bibliothèque native absente : modèle de chat local indisponible";
  try {
    const native = await import("@shenron/native/shenron");
    const { shenronWorkerPool } = await import("@shenron/native/worker");
    native.shenronLoad(library);
    if (native.shenronAbiVersion() < 4)
      return "bibliothèque native trop ancienne (ABI 4 requise) : modèle de chat local indisponible";
    return {
      provision: (request, onProgress, signal) =>
        shenronWorkerPool().llamaProvision(request, { onProgress, signal }),
      startRouter: native.shenronLlamaRouterStart,
      stopRouter: native.shenronLlamaRouterStop,
    };
  } catch (error) {
    return `bibliothèque native : ${String(error).slice(0, 160)}`;
  }
}

/**
 * How the supervisor re-executes this server as its daemon (compiled binary or `bun cli.ts`),
 * with the native library to open (`--library`: the payload copy is not in the environment).
 */
export function daemonLauncher(
  library: string | null,
  execPath = process.execPath,
  argv = process.argv,
  main = Bun.main,
): { program: string; args: string[] } {
  const compiled = main.startsWith("/$bunfs/") || /^[A-Z]:[\\/]~BUN[\\/]/i.test(main);
  const verb = [LLAMA_DAEMON_VERB, ...(library ? ["--library", library] : [])];
  return compiled
    ? { program: execPath, args: verb }
    : { program: execPath, args: [argv[1] ?? main, ...verb] };
}

export interface DownloadProgress {
  received: number;
  total: number | null;
}

type SlotState = "pending" | "downloading" | "loading" | "ready" | "installable" | "failed";

/** One model of the router: what it is made of, then its state on this machine. */
interface Slot {
  id: string;
  label: string;
  state: SlotState;
  progress: DownloadProgress | null;
  detail: string | null;
  model: ShenronLlamaArtifact | null;
  lora: ShenronLlamaArtifact | null;
  /** Raw `llama-server` arguments of this model. */
  extraArgs?: string[];
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
   * `POST /api/local/models/shenron-chat-v2/import` (`{ "path": "<adapter.gguf>" }`), plus the
   * loopback-only OpenAI-compatible `GET /v1/models` and `POST /v1/chat/completions` endpoints.
   * Model installation and import answer this machine only (loopback peer and host).
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

const fileSpec = (path: string, sha256?: string | null): ShenronLlamaArtifact => ({
  spec: `file:${path}`,
  ...(sha256 ? { sha256 } : {}),
});

/** The base model: explicit path, a file of an earlier release, a custom URL, else the catalog. */
export function baseModelSpec(config: ChatModelConfig, modelsDir: string): ShenronLlamaArtifact {
  if (config.modelPath) return fileSpec(config.modelPath);
  const legacy = join(modelsDir, CHAT_BASE_MODEL.file);
  if (isFile(legacy)) return fileSpec(legacy, CHAT_BASE_MODEL.sha256);
  if (config.modelUrl !== CHAT_BASE_MODEL.url)
    return { spec: config.modelUrl, ...(config.modelSha256 ? { sha256: config.modelSha256 } : {}) };
  return { spec: CHAT_BASE_MODEL.id };
}

/** The Shenron adapter on this machine (or its download source), `null` when there is none. */
export function adapterSpec(
  config: ChatModelConfig,
  plan: Pick<ChatModelPlan, "modelsDir" | "shippedDirs">,
  env: Readonly<Record<string, string | undefined>>,
): ShenronLlamaArtifact | null {
  if (!config.lora) return null;
  if (isFile(config.loraPath)) return fileSpec(config.loraPath);
  const found = [
    join(plan.modelsDir, CHAT_ADAPTER.file),
    ...plan.shippedDirs.map((dir) => join(dir, "models", CHAT_ADAPTER.file)),
    env.APHRODY_SHENRON_CHAT_LORA?.trim(),
  ].find(isFile);
  if (found) return fileSpec(found, config.loraSha256);
  return config.loraUrl
    ? { spec: config.loraUrl, ...(config.loraSha256 ? { sha256: config.loraSha256 } : {}) }
    : null;
}

/** `router.json` of the Aphrody router (LOCAL-CHAT.md) over the slots that have a model. */
export function routerConfig(slots: readonly Slot[], ctx: number): unknown {
  return {
    models: slots
      .filter((slot) => slot.model)
      .map((slot) =>
        Object.assign(
          { backend: "llama", id: slot.id, model: slot.model!.spec },
          slot.model!.sha256 ? { sha256: slot.model!.sha256 } : {},
          {
            lora: slot.lora
              ? [
                  {
                    spec: slot.lora.spec,
                    ...(slot.lora.sha256 ? { sha256: slot.lora.sha256 } : {}),
                  },
                ]
              : [],
            ctx,
          },
          slot.extraArgs?.length ? { extra_args: slot.extraArgs } : {},
        ),
      ),
  };
}

interface RouterHealth {
  backends?: { id: string; available: boolean; running: boolean; reason: string | null }[];
}

/**
 * Start the router over the models, provision the default one, warm it up, then Gemma 4 E2B,
 * in the background.
 */
export function startChatModel(
  plan: ChatModelPlan,
  env: Readonly<Record<string, string | undefined>>,
  o: {
    native?: LocalChatNative | Promise<LocalChatNative | string>;
    library?: string | null;
    fetch?: typeof fetch;
    readyTimeoutMs?: number;
  } = {},
): ChatModel {
  const { config } = plan;
  const http = o.fetch ?? fetch;
  const gemma = resolveGemmaConfig(env);
  const shenron: Slot = {
    id: CHAT_MODEL_IDS.shenron,
    label: `${CHAT_BASE_MODEL.label} + ${CHAT_ADAPTER.id}`,
    state: "pending",
    progress: null,
    detail: null,
    model: baseModelSpec(config, plan.modelsDir),
    lora: adapterSpec(config, plan, env),
  };
  if (!shenron.lora) shenron.label = `${CHAT_BASE_MODEL.label} (sans adaptateur)`;
  const legacyGemma = join(plan.modelsDir, GEMMA_MODEL.file);
  const gemmaSlot: Slot | null =
    gemma.mode === "off"
      ? null
      : {
          id: GEMMA_MODEL.id,
          label: GEMMA_MODEL.label,
          state: "pending",
          progress: null,
          detail: null,
          model: isFile(gemma.path)
            ? fileSpec(gemma.path)
            : isFile(legacyGemma)
              ? fileSpec(legacyGemma, GEMMA_MODEL.sha256)
              : gemma.url !== GEMMA_MODEL.url
                ? { spec: gemma.url, ...(gemma.sha256 ? { sha256: gemma.sha256 } : {}) }
                : { spec: GEMMA_MODEL.aphrodyId },
          lora: null,
          // Gemma 4 thinks before answering by default: tens of seconds per turn on a laptop,
          // and an empty answer when the budget runs out first. The chat wants the answer.
          extraArgs: ["--reasoning", "off"],
        };
  const slots = [shenron, ...(gemmaSlot ? [gemmaSlot] : [])];
  const aborts = new AbortController();
  let native: LocalChatNative | null = null;
  let router: LlamaRouterInfo | null = null;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    aborts.abort();
    if (router) native?.stopRouter();
    router = null;
  };
  process.once("exit", stop);

  const fail = (slot: Slot, detail: string) => {
    slot.state = "failed";
    slot.detail = detail;
    slot.progress = null;
  };
  const provisionRequest = (slot: Slot): ShenronLlamaProvision => ({
    modelsDir: plan.modelsDir,
    ...(slot.model ? { model: slot.model } : {}),
    lora: slot.lora ? [slot.lora] : [],
  });
  /** Make the files of `slot` present; `true` once they are. */
  const provision = async (slot: Slot): Promise<boolean> => {
    if (!native) return false;
    slot.state = "downloading";
    slot.progress = null;
    try {
      await native.provision(
        provisionRequest(slot),
        (progress) => {
          slot.progress = { received: progress.downloaded ?? 0, total: progress.total };
        },
        aborts.signal,
      );
      slot.progress = null;
      return true;
    } catch (error) {
      if (!stopped) fail(slot, `téléchargement : ${String(error).slice(0, 160)}`);
      return false;
    }
  };

  /** (Re)start the router over the slots on the plan's port. */
  const startRouter = (): boolean => {
    if (!native || stopped) return false;
    mkdirSync(plan.stateDir, { recursive: true });
    const file = join(plan.stateDir, "router.json");
    writeFileSync(file, `${JSON.stringify(routerConfig(slots, config.ctx), null, 2)}\n`);
    try {
      router = native.startRouter({
        config: file,
        modelsDir: plan.modelsDir,
        stateDir: plan.stateDir,
        ...(config.llamaBin ? { llamaBin: config.llamaBin } : {}),
        searchDirs: plan.shippedDirs,
        bind: `127.0.0.1:${plan.port}`,
        daemon: daemonLauncher(o.library ?? null),
      });
      if (!router.llamaBin)
        for (const slot of slots)
          fail(slot, "llama-server absent : modèle de chat local indisponible");
      return router.llamaBin !== null;
    } catch (error) {
      for (const slot of slots) fail(slot, `routeur de modèles : ${String(error).slice(0, 160)}`);
      router = null;
      return false;
    }
  };

  /** Per-model availability reported by the router (`/health`). */
  const routerHealth = async (): Promise<Map<string, { available: boolean; running: boolean }>> => {
    const states = new Map<string, { available: boolean; running: boolean }>();
    if (!router) return states;
    try {
      const response = await http(router.healthUrl, { signal: AbortSignal.timeout(5_000) });
      const body = (await response.json()) as RouterHealth;
      for (const backend of body.backends ?? []) states.set(backend.id, backend);
    } catch {
      // the router is restarting
    }
    return states;
  };

  /** Start the default model now (the router would on the first request): one-token answer. */
  const warmUp = async (): Promise<boolean> => {
    if (!router) return false;
    shenron.state = "loading";
    try {
      const response = await http(`${router.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: shenron.id,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
          stream: false,
        }),
        signal: AbortSignal.any([aborts.signal, AbortSignal.timeout(o.readyTimeoutMs ?? 300_000)]),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        fail(shenron, body?.error?.message ?? `le serveur de modèles a répondu ${response.status}`);
        return false;
      }
      shenron.state = "ready";
      shenron.detail ??=
        !shenron.lora && config.lora
          ? `adaptateur ${CHAT_ADAPTER.id} introuvable : importez son fichier`
          : null;
      return true;
    } catch (error) {
      if (!stopped) fail(shenron, `chargement du modèle : ${String(error).slice(0, 160)}`);
      return false;
    }
  };

  let installing: Promise<boolean> | null = null;
  const install = (id: string): Promise<boolean> => {
    if (!gemmaSlot || id !== gemmaSlot.id) return Promise.resolve(false);
    if (gemmaSlot.state === "ready") return Promise.resolve(true);
    installing ??= (async () => {
      try {
        // The router finds the files on its next request: no restart.
        if (!(await provision(gemmaSlot))) return false;
        gemmaSlot.state = "ready";
        gemmaSlot.detail = null;
        return true;
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
    shenron.lora = fileSpec(dest, config.loraSha256);
    shenron.label = `${CHAT_BASE_MODEL.label} + ${CHAT_ADAPTER.id}`;
    shenron.detail = null;
    if (shenron.state === "ready" && startRouter() && (await provision(shenron))) await warmUp();
    return { ok: true };
  };

  const run = async (): Promise<boolean> => {
    const loaded = await (o.native ?? nativeLocalChat(o.library ?? null));
    if (typeof loaded === "string") {
      for (const slot of slots) fail(slot, loaded);
      return false;
    }
    native = loaded;
    if (!startRouter()) return false;
    if (gemmaSlot) {
      const health = await routerHealth();
      gemmaSlot.state = health.get(gemmaSlot.id)?.available ? "ready" : "installable";
    }
    if (!(await provision(shenron)) || stopped) return false;
    if (!(await warmUp())) return false;
    // Gemma 4 E2B follows the default model on the first launch (`manual`: on request).
    if (gemmaSlot?.state === "installable" && gemma.mode === "auto") void install(gemmaSlot.id);
    return shenron.state === "ready";
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

  const entryOf = (
    slot: Slot,
    health: Map<string, { available: boolean; running: boolean }>,
  ): ChatModelEntry => {
    const state: ChatModelState =
      slot.state === "ready"
        ? router && health.get(slot.id)?.available !== false
          ? "ready"
          : "loading"
        : slot.state === "pending"
          ? "loading"
          : slot.state;
    return {
      id: slot.id,
      label: slot.label,
      backend: "local",
      available: state === "ready",
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
    const health = await routerHealth();
    return slots.map((slot) => entryOf(slot, health));
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
      const openAiPath = url.pathname === "/v1/models" || url.pathname === "/v1/chat/completions";
      if (openAiPath) {
        if (!isLocalRequest(request, url, peer))
          return Response.json({ error: { message: "this machine only" } }, { status: 403 });
        const method = url.pathname === "/v1/models" ? "GET" : "POST";
        if (request.method !== method)
          return Response.json({ error: { message: `${method} only` } }, { status: 405 });
        if (
          method === "POST" &&
          !request.headers.get("content-type")?.startsWith("application/json")
        )
          return Response.json(
            { error: { message: "application/json required" } },
            { status: 415 },
          );
        if (!router)
          return Response.json(
            { error: { message: "local chat model is not ready" } },
            { status: 503 },
          );

        const path = url.pathname === "/v1/models" ? "/models" : "/chat/completions";
        const upstreamHeaders = new Headers();
        for (const name of ["accept", "content-type"]) {
          const value = request.headers.get(name);
          if (value) upstreamHeaders.set(name, value);
        }
        try {
          const upstream = await http(`${router.baseUrl}${path}${url.search}`, {
            method,
            headers: upstreamHeaders,
            ...(method === "POST" ? { body: request.body } : {}),
            signal: request.signal,
            redirect: "error",
          });
          const responseHeaders = new Headers({ "cache-control": "no-store" });
          const contentType = upstream.headers.get("content-type");
          if (contentType) responseHeaders.set("content-type", contentType);
          return new Response(upstream.body, {
            status: upstream.status,
            headers: responseHeaders,
          });
        } catch (error) {
          if (request.signal.aborted) return new Response(null, { status: 499, headers });
          return Response.json(
            {
              error: {
                message: `local chat router unavailable: ${String(error).slice(0, 160)}`,
              },
            },
            { status: 502, headers },
          );
        }
      }
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
      if (shenron.state === "ready" && router)
        return { available: true, reason: `${shenron.label}${extra}` };
      if (shenron.state === "ready")
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
