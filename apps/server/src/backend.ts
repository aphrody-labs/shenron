// SPDX-License-Identifier: Apache-2.0
/**
 * The API backend of `shenron-server`: the single Shenron API host (`@shenron/api/host`)
 * wired from SHENRON_HOME, the embedded payload and the files shipped beside the executable,
 * for every profile. First match wins:
 *
 *   VFS            SHENRON_VFS_DB, `<home>/data/shenron-vfs.sqlite`, the payload's
 *                  `vfs/shenron-vfs.sqlite` (public build), `vfs/` beside the executable
 *   conversations  SHENRON_CHAT_PG_URL (PostgreSQL), else `<home>/data/conversations.sqlite`
 *                  (SHENRON_CHAT_STORE overrides the file, `off` disables it)
 *   agent home     per user, outside production: `<home>/agents/<id>/` (./agent-home.ts: `local`
 *                  until Discord sign-in, then `discord:<user_id>`; SHENRON_LOCAL_OWNER follows);
 *                  shared persona: the VFS `/home`, else APHRODY_WORKSPACE, else (outside
 *                  production) the public template of the payload (`home/`)
 *   OCR            APHRODY_BIN, else `aphrody` beside the executable, else on PATH
 *   MCP            SHENRON_MCP_URL, else the `shenron-mcp` sidecar shipped beside the
 *                  executable (SHENRON_MCP_BIN, `./`, `./binaries/`, as `shenron-desktop`
 *                  finds `shenron-server`), started on `--http 127.0.0.1:<free port> --public`
 *   editor engine  SHENRON_KOHARU_SDK_BIN, else the `koharu-sdk` sidecar beside the executable,
 *                  started on first use by `/api/local/koharu` (./koharu.ts); never in production
 *   lexicon        SHENRON_LEXIQUE, else the payload's `data/lexique-db-canonique.json` (the
 *                  canonical glossary of French translation and of the editor's agent)
 *   memory         one per agent home (`discord:<id>`, `local`): `memoryLocation`, else
 *                  `<home>/data/memory.sqlite` (SHENRON_MEMORY_DB, SHENRON_MEMORY=off); Aphrody's
 *                  aphrody-memory through the native library (./memory.ts); none → group disabled
 *   chat           SHENRON_CHAT_BACKENDS (default `local,gemini-web` outside production): the
 *                  OpenAI-compatible server declared by APHRODY_AI_CHAT_BASE_URL,
 *                  APHRODY_SHENRON_LLM_BASE_URL or APHRODY_LOCAL_MODEL_URL (llama-server,
 *                  aphrody-llama-daemon); none → the chat and models groups stay disabled.
 *                  Desktop profile without such a URL: the managed model of ./chat-model.ts
 *                  (Qwen3-4B + LoRA shenron-chat-v2 on a `llama-server` child; SHENRON_CHAT_MODEL)
 *
 * Production keeps the editorial wiki on the site (PostgreSQL), serves only public VFS nodes
 * and has no implicit loopback owner (nginx forwards every request from 127.0.0.1).
 * A missing capability never stops the server: its group reports why in `/api/local/health`.
 */
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { createLocalApi, type LocalApi as HostApi, type MemoryLocation } from "@shenron/api/host";
import type { LocalApiGroups } from "@shenron/api/contract";
import { DEFAULT_CHAT_MODEL_ID, DEFAULT_LOCAL_CHAT_BACKENDS } from "@shenron/config/chat-model";

import { type AgentHomes, openAgentHomes } from "./agent-home";
import { type ChatModel, type ChatModelPlan, planChatModel, startChatModel } from "./chat-model";
import { profileOf, type ServerPaths } from "./config";
import { freePort } from "./front";
import { koharuBridge, type KoharuBridge } from "./koharu";
import { nativeMemory } from "./memory";

export const VFS_FILE = "shenron-vfs.sqlite";
/** Canonical lexicon shipped in the payload (`data/`, scripts/build/server-data.ts). */
export const LEXIQUE_FILE = "lexique-db-canonique.json";

const exe = (name: string) => (process.platform === "win32" ? `${name}.exe` : name);
const isFile = (path: string | undefined | null): path is string =>
  Boolean(path) && existsSync(path!) && statSync(path!).isFile();

/** A binary shipped beside the executable: the explicit variable, `./name`, `./binaries/name`. */
export function siblingBinary(
  paths: Pick<ServerPaths, "exeDir">,
  name: string,
  explicit?: string,
): string | null {
  const candidates = [
    explicit?.trim(),
    join(paths.exeDir, exe(name)),
    join(paths.exeDir, "binaries", exe(name)),
  ];
  return candidates.find((candidate) => isFile(candidate)) ?? null;
}

export interface BackendPlan {
  /** Environment of the API host (a copy: `process.env` is left to Next and the bot). */
  env: Record<string, string | undefined>;
  /** `shenron-mcp` to start as a sidecar, when no SHENRON_MCP_URL is configured. */
  mcpSidecar: string | null;
  /** The site's wiki stays on the site (production, PostgreSQL). */
  wiki: boolean;
  /** `koharu-sdk` behind `/api/local/koharu`; `null` when absent or in production. */
  koharuSdk: string | null;
  /** Managed chat model (`llama-server` + adapter); `null` when off or the chat is external. */
  chatModel: ChatModelPlan | null;
}

/** Resolve what the API host runs on (no process started, nothing written). */
export function planBackend(
  paths: ServerPaths,
  env: Readonly<Record<string, string | undefined>> = process.env,
  o: { payloadDir?: string } = {},
): BackendPlan {
  const profile = profileOf(env);
  const out: Record<string, string | undefined> = { ...env };
  out.SHENRON_DATA_DIR ??= paths.data;
  out.SHENRON_VFS_CACHE ??= join(paths.cache, "vfs");
  const vfs = [
    env.SHENRON_VFS_DB?.trim(),
    join(paths.data, VFS_FILE),
    o.payloadDir ? join(o.payloadDir, "vfs", VFS_FILE) : undefined,
    join(paths.exeDir, "vfs", VFS_FILE),
  ].find((candidate) => isFile(candidate));
  if (vfs) out.SHENRON_VFS_DB = vfs;
  else delete out.SHENRON_VFS_DB;
  if (profile !== "production" && !env.APHRODY_WORKSPACE?.trim()) {
    const template = [
      o.payloadDir ? join(o.payloadDir, "home") : undefined,
      join(paths.exeDir, "home"),
    ]
      .filter((dir): dir is string => Boolean(dir))
      .find((dir) => isFile(join(dir, "SOUL.md")));
    if (template) out.APHRODY_WORKSPACE = template;
  }
  const aphrody = siblingBinary(paths, "aphrody");
  if (!env.APHRODY_BIN?.trim() && aphrody) out.APHRODY_BIN = aphrody;
  const mcp = siblingBinary(paths, "shenron-mcp", env.SHENRON_MCP_BIN);
  // The chat's own MCP tools (stdio) use the same shipped binary.
  if (mcp) out.SHENRON_MCP_BIN = mcp;
  // Local models first, then the Gemini web app when its client and cookies exist (remote).
  if (profile !== "production") out.SHENRON_CHAT_BACKENDS ??= DEFAULT_LOCAL_CHAT_BACKENDS;
  const chatModel = planChatModel(paths, env);
  if (chatModel?.binary) {
    // Declared now (the groups are fixed at host creation); the model answers once loaded.
    out.APHRODY_LOCAL_MODEL_URL = chatModel.url;
    out.APHRODY_AI_CHAT_MODEL ??= DEFAULT_CHAT_MODEL_ID;
  }
  // The `shenron` plugin (index in every chat prompt, `/api/public/plugin*`): the payload
  // copy, beside the executable, else the checkout this source runs from.
  if (!env.SHENRON_PLUGIN_DIR?.trim()) {
    const plugin = [
      o.payloadDir ? join(o.payloadDir, "plugin") : undefined,
      join(paths.exeDir, "plugin"),
      join(import.meta.dir, "..", "..", "..", "plugin"),
    ].find((dir) => isFile(dir && join(dir, ".claude-plugin", "plugin.json")));
    if (plugin) out.SHENRON_PLUGIN_DIR = plugin;
  }
  const lexique = o.payloadDir ? join(o.payloadDir, "data", LEXIQUE_FILE) : undefined;
  if (!env.SHENRON_LEXIQUE?.trim() && isFile(lexique)) out.SHENRON_LEXIQUE = lexique;
  const koharuSdk = siblingBinary(paths, "koharu-sdk", env.SHENRON_KOHARU_SDK_BIN);
  if (profile === "production") {
    out.SHENRON_VFS_PUBLIC_ONLY ??= "1";
    out.SHENRON_LOCAL_OWNER ??= "";
  }
  return {
    env: out,
    mcpSidecar: env.SHENRON_MCP_URL?.trim() ? null : mcp,
    wiki: profile !== "production",
    koharuSdk: profile === "production" ? null : koharuSdk,
    chatModel,
  };
}

export interface McpSidecar {
  url: string;
  exited(): boolean;
  stop(): void;
}

/** Start `shenron-mcp --http 127.0.0.1:<free port> --public` and wait for its `/health`. */
export async function startMcpSidecar(
  binary: string,
  o: { env?: Record<string, string | undefined>; timeoutMs?: number } = {},
): Promise<McpSidecar> {
  const port = freePort();
  const url = `http://127.0.0.1:${port}`;
  const child = Bun.spawn([binary, "--http", `127.0.0.1:${port}`, "--public"], {
    env: o.env ?? process.env,
    stdio: ["ignore", "ignore", "inherit"],
    // No console window of its own beside the desktop app (Windows).
    windowsHide: true,
  });
  const stop = () => {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  };
  process.once("exit", stop);
  const deadline = Date.now() + (o.timeoutMs ?? 15_000);
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(`shenron-mcp exited with ${child.exitCode ?? child.signalCode}`);
    try {
      const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) {
        return {
          url,
          exited: () => child.exitCode !== null || child.signalCode !== null,
          stop,
        };
      }
    } catch {
      // not listening yet
    }
    await Bun.sleep(50);
  }
  stop();
  throw new Error(`shenron-mcp did not answer /health within ${o.timeoutMs ?? 15_000} ms`);
}

const API_DOWN = "API locale indisponible";

/** Every group unavailable for one reason (no API host). */
export function unavailableGroups(reason: string): LocalApiGroups {
  const status = { available: false, reason };
  return {
    wiki: { ...status },
    rag: { ...status },
    chat: { ...status },
    conversations: { ...status },
    sync: { ...status },
    vfs: { ...status },
    ocr: { ...status },
    mcp: { ...status },
    models: { ...status },
    memory: { ...status },
  };
}

export interface Backend {
  host: HostApi | null;
  /** The editor engine bridge of `/api/local/koharu`. */
  koharu: KoharuBridge;
  /** Managed local chat models (`/api/local/models`); `null` when off or external. */
  chatModel: ChatModel | null;
  /** Agent homes of this machine (`/api/local/agent-home`); `null` in production. */
  agentHomes: AgentHomes | null;
  /** Variables the Next child adds to the process environment (the sidecar MCP URL). */
  nextEnv: Record<string, string>;
  /** Availability of each API group, the MCP sidecar's liveness included. */
  groups(): LocalApiGroups;
  stop(): Promise<void>;
}

export async function startBackend(
  paths: ServerPaths,
  env: Readonly<Record<string, string | undefined>> = process.env,
  o: {
    payloadDir?: string;
    createHost?: typeof createLocalApi;
    spawnEngine?: Parameters<typeof koharuBridge>[0]["spawn"];
    /** Memory database of each agent home (agent home resolver); default `<home>/data/memory.sqlite`. */
    memoryLocation?: MemoryLocation;
    /** Agent homes of this machine (default: opened under `<home>/agents` outside production). */
    agentHomes?: AgentHomes | null;
  } = {},
): Promise<Backend> {
  const plan = planBackend(paths, env, o);
  const profile = profileOf(env);
  // The active agent home sets the loopback owner (plan.env) before the host reads it.
  let agentHomes: AgentHomes | null = o.agentHomes === undefined ? null : o.agentHomes;
  if (o.agentHomes === undefined && profile !== "production") {
    try {
      agentHomes = openAgentHomes(paths, plan.env);
    } catch (error) {
      console.error(
        JSON.stringify({ event: "shenron.agent_home.unavailable", error: String(error) }),
      );
    }
  }
  const koharu = koharuBridge({
    binary: plan.koharuSdk,
    disabled: profile === "production" ? "désactivé en production" : undefined,
    env: plan.env,
    spawn: o.spawnEngine,
  });
  // The chat model (download, llama-server, warm-up) is the longest step of a cold start: it
  // begins before the MCP sidecar is awaited, and needs nothing from it.
  const chatModel: ChatModel | null = plan.chatModel
    ? startChatModel(plan.chatModel, plan.env)
    : null;
  let sidecar: McpSidecar | null = null;
  let sidecarFailed = false;
  if (plan.mcpSidecar) {
    try {
      sidecar = await startMcpSidecar(plan.mcpSidecar, { env: plan.env });
      plan.env.SHENRON_MCP_URL = sidecar.url;
    } catch (error) {
      sidecarFailed = true;
      console.error(JSON.stringify({ event: "shenron.mcp.sidecar_failed", error: String(error) }));
    }
  }
  let host: HostApi | null = null;
  try {
    host = (o.createHost ?? createLocalApi)(plan.env, {
      service: profile === "desktop" ? "shenron-desktop" : "shenron-server",
      wiki: plan.wiki,
      ...(chatModel ? { chatModels: chatModel.catalog } : {}),
      memory: nativeMemory(paths, plan.env),
      ...(agentHomes
        ? {
            agentHome: agentHomes.dirOf,
            memoryLocation: o.memoryLocation ?? agentHomes.memoryLocation,
            memoryAliases: agentHomes.memoryAliases,
          }
        : o.memoryLocation
          ? { memoryLocation: o.memoryLocation }
          : {}),
    });
  } catch (error) {
    console.error(JSON.stringify({ event: "shenron.api.unavailable", error: String(error) }));
  }
  return {
    host,
    koharu,
    chatModel,
    agentHomes,
    nextEnv: sidecar ? { SHENRON_MCP_URL: sidecar.url } : {},
    groups() {
      if (!host) return unavailableGroups(API_DOWN);
      const groups = { ...host.groups };
      if (sidecar?.exited()) groups.mcp = { available: false, reason: "serveur MCP local arrêté" };
      else if (sidecarFailed)
        groups.mcp = { available: false, reason: "serveur MCP local injoignable" };
      if (chatModel) {
        groups.chat = chatModel.status();
        groups.models = { ...groups.chat };
      }
      return groups;
    },
    async stop() {
      koharu.stop();
      sidecar?.stop();
      chatModel?.stop();
      await host?.close();
    },
  };
}
