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
 *   agent home     the VFS `/home`, else APHRODY_WORKSPACE, else (outside production) the
 *                  public template of the payload (`home/`)
 *   OCR            APHRODY_BIN, else `aphrody` beside the executable, else on PATH
 *   MCP            SHENRON_MCP_URL, else the `shenron-mcp` sidecar shipped beside the
 *                  executable (SHENRON_MCP_BIN, `./`, `./binaries/`, as `shenron-desktop`
 *                  finds `shenron-server`), started on `--http 127.0.0.1:<free port> --public`
 *   chat           SHENRON_CHAT_BACKENDS (default `local` outside production): the
 *                  OpenAI-compatible server declared by APHRODY_AI_CHAT_BASE_URL,
 *                  APHRODY_SHENRON_LLM_BASE_URL or APHRODY_LOCAL_MODEL_URL (llama-server,
 *                  aphrody-llama-daemon); none → the chat and models groups stay disabled
 *
 * Production keeps the editorial wiki on the site (PostgreSQL), serves only public VFS nodes
 * and has no implicit loopback owner (nginx forwards every request from 127.0.0.1).
 * A missing capability never stops the server: its group reports why in `/api/local/health`.
 */
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { createLocalApi, type LocalApi as HostApi } from "@shenron/api/host";
import type { LocalApiGroups } from "@shenron/api/contract";

import { profileOf, type ServerPaths } from "./config";
import { freePort } from "./front";

export const VFS_FILE = "shenron-vfs.sqlite";

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
  if (profile !== "production") out.SHENRON_CHAT_BACKENDS ??= "local";
  if (profile === "production") {
    out.SHENRON_VFS_PUBLIC_ONLY ??= "1";
    out.SHENRON_LOCAL_OWNER ??= "";
  }
  return {
    env: out,
    mcpSidecar: env.SHENRON_MCP_URL?.trim() ? null : mcp,
    wiki: profile !== "production",
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
  };
}

export interface Backend {
  host: HostApi | null;
  /** Variables the Next child adds to the process environment (the sidecar MCP URL). */
  nextEnv: Record<string, string>;
  /** Availability of each API group, the MCP sidecar's liveness included. */
  groups(): LocalApiGroups;
  stop(): Promise<void>;
}

export async function startBackend(
  paths: ServerPaths,
  env: Readonly<Record<string, string | undefined>> = process.env,
  o: { payloadDir?: string; createHost?: typeof createLocalApi } = {},
): Promise<Backend> {
  const plan = planBackend(paths, env, o);
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
  const profile = profileOf(env);
  let host: HostApi | null = null;
  try {
    host = (o.createHost ?? createLocalApi)(plan.env, {
      service: profile === "desktop" ? "shenron-desktop" : "shenron-server",
      wiki: plan.wiki,
    });
  } catch (error) {
    console.error(JSON.stringify({ event: "shenron.api.unavailable", error: String(error) }));
  }
  return {
    host,
    nextEnv: sidecar ? { SHENRON_MCP_URL: sidecar.url } : {},
    groups() {
      if (!host) return unavailableGroups(API_DOWN);
      const groups = { ...host.groups };
      if (sidecar?.exited()) groups.mcp = { available: false, reason: "serveur MCP local arrêté" };
      else if (sidecarFailed)
        groups.mcp = { available: false, reason: "serveur MCP local injoignable" };
      return groups;
    },
    async stop() {
      sidecar?.stop();
      await host?.close();
    },
  };
}
