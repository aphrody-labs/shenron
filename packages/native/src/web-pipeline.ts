// SPDX-License-Identifier: Apache-2.0
/**
 * Shenron boundary for web workflows and the MCP client. Commands run through the `shenron`
 * binary (SHENRON_BIN, default `shenron` on PATH) with a deadline and abort signal; MCP tools go
 * through the public MCP SDK over streamable HTTP. No in-process foreign library is loaded.
 */
import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CapturedResult } from "./engine";

export interface WebPipelineOptions {
  signal?: AbortSignal;
  /** The process is killed at the deadline; persisted campaign evidence remains. */
  timeoutMs?: number;
}

export interface McpInvocation {
  /** Standard MCP config path (`{ "mcpServers": { name: { url, headers } } }`); header values may be `$ENV_NAME` references. */
  config?: string;
  server: string;
  tool: string;
  arguments: Record<string, unknown>;
}

const MAX_ARGS = 256;
const MAX_BYTES = 1_048_576;
const DEFAULT_TIMEOUT_MS = 1_800_000;

function deadline(options: WebPipelineOptions) {
  options.signal?.throwIfAborted();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 0xffff_ffff)
    throw new RangeError("Web workflow timeout must be a positive uint32 millisecond value");
  const timer = AbortSignal.timeout(timeoutMs);
  return options.signal ? AbortSignal.any([options.signal, timer]) : timer;
}

function checkArgs(args: readonly string[]) {
  if (
    args.length < 1 ||
    args.length > MAX_ARGS ||
    args.some((arg) => typeof arg !== "string" || arg.includes("\0"))
  )
    throw new TypeError("Web workflows require 1..256 string arguments without NUL");
  if (new TextEncoder().encode(JSON.stringify(args)).byteLength > MAX_BYTES)
    throw new RangeError("Web workflow arguments exceed one MiB");
}

/** Compatibility commands: `shenron <args>` captured. */
export async function commandPipeline(
  args: readonly string[],
  options: WebPipelineOptions = {},
): Promise<CapturedResult> {
  checkArgs(args);
  const signal = deadline(options);
  const proc = Bun.spawn([process.env.SHENRON_BIN || "shenron", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    signal,
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  signal.throwIfAborted();
  return { code, stdout, stderr } as CapturedResult;
}

/** Arguments omit the leading `web`: runs `shenron web <args>` and parses its JSON result. */
export async function webPipeline<T = unknown>(
  args: readonly string[],
  options: WebPipelineOptions = {},
): Promise<T> {
  checkArgs(args);
  const result = await commandPipeline(["web", ...args], options);
  if (result.code !== 0)
    throw new Error(result.stderr.trim() || `shenron web exited with ${result.code}`);
  const value: unknown = JSON.parse(result.stdout);
  if (value === null || typeof value !== "object")
    throw new Error("Web workflow returned an invalid result");
  if ("error" in value) throw new Error(String((value as { error: unknown }).error));
  return value as T;
}

interface McpServerConfig {
  url?: string;
  headers?: Record<string, string>;
}

interface McpResult<T> {
  server: string;
  tool: string;
  result: T;
}

function resolveEnv(value: string): string {
  return value.startsWith("$") ? (process.env[value.slice(1)] ?? "") : value;
}

export async function mcpTool<T = unknown>(
  request: McpInvocation,
  options: WebPipelineOptions = {},
): Promise<McpResult<T>> {
  if (
    !request.server ||
    !request.tool ||
    request.arguments === null ||
    typeof request.arguments !== "object" ||
    Array.isArray(request.arguments)
  )
    throw new TypeError("MCP workflows require a server, tool and object arguments");
  const signal = deadline(options);
  const path = request.config ?? process.env.SHENRON_MCP_CONFIG;
  if (!path) throw new Error("MCP config path required (config or SHENRON_MCP_CONFIG)");
  const config = JSON.parse(await readFile(path, "utf8")) as {
    mcpServers?: Record<string, McpServerConfig>;
  };
  const server = config.mcpServers?.[request.server];
  if (!server?.url)
    throw new Error(`MCP server ${request.server} has no HTTP url (stdio is refused)`);
  const headers = Object.fromEntries(
    Object.entries(server.headers ?? {}).map(([k, v]) => [k, resolveEnv(v)]),
  );
  const client = new Client({ name: "shenron", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers } }),
    {
      signal,
    },
  );
  try {
    const result = await client.callTool(
      { name: request.tool, arguments: request.arguments },
      undefined,
      { signal },
    );
    return { server: request.server, tool: request.tool, result: result as T };
  } finally {
    await client.close();
  }
}
