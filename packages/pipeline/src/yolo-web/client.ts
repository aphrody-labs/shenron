// SPDX-License-Identifier: Apache-2.0
/**
 * YOLO WEB client (github.com/yolo-rs/yolo-web).
 *
 * Transport: the MCP server of `web-cli mcp` over stdio (newline-delimited JSON-RPC 2.0,
 * `serveStdio` of @yolo-web/mcp-native). The `browser_*` tools it exposes drive a Chrome
 * DevTools Protocol endpoint that yolo-web does NOT start: `YOLO_CDP_ENDPOINT` (or
 * `YOLO_CDP_PORT`, default 9222) and `YOLO_CDP_TOKEN` are read by the spawned server, so they
 * pass through the inherited environment.
 *
 * Configuration (no default, a missing value is an error, never a fallback):
 *   YOLO_WEB_CLI  path of the `web-cli` entry: `packages/web-cli/src/index.ts` of a yolo-web
 *                 checkout (run with the current Bun) or a compiled executable taking `mcp`.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

export class YoloWebNotConfiguredError extends Error {
  constructor(variable: string) {
    super(`${variable} is not configured (YOLO WEB entry required)`);
    this.name = "YoloWebNotConfiguredError";
  }
}

export interface YoloWebOptions {
  /** Overrides `YOLO_WEB_CLI`. */
  cli?: string;
  /** Environment of the spawned server (defaults to `process.env`). */
  env?: Record<string, string | undefined>;
  /** Per-request deadline, 60 s by default. */
  timeoutMs?: number;
}

export interface YoloWebPage {
  url: string;
  title: string;
  /** Rendered document HTML (`document.documentElement.outerHTML`). */
  content: string;
}

export interface YoloWebTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

function assertPageUrl(url: string): URL {
  const target = new URL(url);
  if (!["http:", "https:"].includes(target.protocol) || target.username || target.password)
    throw new Error("YOLO WEB requires an HTTP(S) page URL without credentials");
  return target;
}

export function resolveYoloWebCli(explicit?: string): string {
  const cli = (explicit ?? process.env.YOLO_WEB_CLI)?.trim();
  if (!cli) throw new YoloWebNotConfiguredError("YOLO_WEB_CLI");
  return cli;
}

type Pending = { resolve(value: unknown): void; reject(error: Error): void; timer: Timer };

/** MCP client over the stdio of a spawned `web-cli mcp`. */
export class YoloWebMcp {
  private child: ChildProcessWithoutNullStreams | undefined;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  private initialized: Promise<void> | undefined;
  private stderr = "";
  serverInfo: { name?: string; version?: string } = {};

  constructor(private readonly options: YoloWebOptions = {}) {}

  private start(): ChildProcessWithoutNullStreams {
    if (this.child) return this.child;
    const cli = resolveYoloWebCli(this.options.cli);
    const script = /\.(?:[cm]?[jt]s)$/.test(cli);
    const child = spawn(script ? process.execPath : cli, script ? [cli, "mcp"] : ["mcp"], {
      env: { ...process.env, ...this.options.env } as NodeJS.ProcessEnv,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    child.stderr.on("data", (chunk: Buffer) => {
      this.stderr = (this.stderr + chunk.toString()).slice(-2000);
    });
    createInterface({ input: child.stdout }).on("line", (line) => {
      let message: { id?: number; result?: unknown; error?: { message?: string } };
      try {
        message = JSON.parse(line);
      } catch {
        return; // not a protocol line
      }
      if (typeof message.id !== "number") return;
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.error) entry.reject(new Error(`YOLO WEB MCP: ${message.error.message}`));
      else entry.resolve(message.result);
    });
    const fail = (reason: string) => {
      for (const [id, entry] of this.pending) {
        clearTimeout(entry.timer);
        entry.reject(new Error(`YOLO WEB server ${reason}: ${this.stderr.trim().slice(-300)}`));
        this.pending.delete(id);
      }
    };
    child.on("error", (error) => fail(`failed to start (${error.message})`));
    child.on("exit", (code) => fail(`exited with code ${code}`));
    return child;
  }

  private write(message: Record<string, unknown>) {
    this.start().stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
  }

  private request(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`YOLO WEB MCP ${method} timed out`));
      }, this.options.timeoutMs ?? 60_000);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.write({ id, method, params });
      } catch (error) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  connect(): Promise<void> {
    this.initialized ??= (async () => {
      const result = (await this.request("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "shenron-pipeline", version: "1" },
      })) as { serverInfo?: { name?: string; version?: string } };
      this.serverInfo = result.serverInfo ?? {};
      this.write({ method: "notifications/initialized" });
    })();
    return this.initialized;
  }

  async listTools(): Promise<YoloWebTool[]> {
    await this.connect();
    const result = (await this.request("tools/list")) as { tools?: YoloWebTool[] };
    return result.tools ?? [];
  }

  /** Calls one tool; the text content is JSON-decoded when possible. */
  async tool<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    await this.connect();
    const result = (await this.request("tools/call", { name, arguments: args })) as {
      isError?: boolean;
      content?: Array<{ type: string; text?: string }>;
    };
    const text = result.content?.find((part) => part.type === "text")?.text ?? "";
    if (result.isError) throw new Error(`YOLO WEB tool ${name} failed: ${text.slice(0, 300)}`);
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  }

  async navigate(url: string): Promise<void> {
    await this.tool("browser_navigate", { url: assertPageUrl(url).href });
  }

  /** Page text of the current tab (`# title`, `Source: url`, then `innerText`). */
  async markdown(url?: string): Promise<string> {
    if (url) await this.navigate(url);
    const out = await this.tool<unknown>("browser_markdown");
    return typeof out === "string" ? out : JSON.stringify(out);
  }

  /** `schema` maps result keys to CSS selectors; each key yields the matching elements. */
  async extract<T = Record<string, unknown[]>>(
    schema: Record<string, string>,
    url?: string,
  ): Promise<T> {
    if (url) await this.navigate(url);
    return this.tool<T>("browser_extract", { schema });
  }

  /** Evaluates JavaScript in the page and returns the value. */
  async evaluate<T = unknown>(script: string, timeoutMs?: number): Promise<T> {
    const out = await this.tool<{ result?: { value?: T }; exceptionDetails?: unknown }>(
      "browser_evaluate",
      { script, ...(timeoutMs ? { timeoutMs } : {}) },
    );
    if (out.exceptionDetails) throw new Error("YOLO WEB page script threw");
    return out.result?.value as T;
  }

  /** Renders a page and returns its HTML. */
  async capture(url: string): Promise<YoloWebPage> {
    const target = assertPageUrl(url);
    await this.navigate(target.href);
    const value = await this.evaluate<{ title?: string; html?: string }>(
      "({ title: document.title, html: document.documentElement.outerHTML })",
    );
    if (typeof value?.html !== "string") throw new Error("YOLO WEB returned no page HTML");
    return { url: target.href, title: value.title ?? "", content: value.html };
  }

  screenshot(args: { selector?: string; fullPage?: boolean; path?: string } = {}) {
    return this.tool("browser_screenshot", args);
  }

  storageState() {
    return this.tool("browser_storage_state");
  }

  close(): void {
    this.child?.stdin.end();
    this.child?.kill();
    this.child = undefined;
  }
}

/** Runs `run` with a fresh server and always stops it. */
export async function withYoloWeb<T>(
  run: (mcp: YoloWebMcp) => Promise<T>,
  options: YoloWebOptions = {},
): Promise<T> {
  const mcp = new YoloWebMcp(options);
  try {
    return await run(mcp);
  } finally {
    mcp.close();
  }
}

/** Captures rendered page HTML through YOLO WEB. */
export function scrapeWithYoloWeb(url: string, options: YoloWebOptions = {}): Promise<YoloWebPage> {
  return withYoloWeb((mcp) => mcp.capture(url), options);
}

export interface YoloWebScrapeOptions extends YoloWebOptions {
  /** CSS selector: returns the trimmed text of each match, one per line, instead of the page text. */
  selector?: string;
  /** Maximum number of selector matches. */
  max?: number;
}

/** Page text (or selector text) through YOLO WEB; throws when unconfigured. */
export function yoloWebScrape(url: string, options: YoloWebScrapeOptions = {}): Promise<string> {
  return withYoloWeb(async (mcp) => {
    if (!options.selector) return mcp.markdown(url);
    await mcp.navigate(url);
    const limit = Math.max(1, Math.floor(options.max ?? 200));
    const value = await mcp.evaluate<string[]>(
      `Array.from(document.querySelectorAll(${JSON.stringify(options.selector)})).slice(0, ${limit}).map((el) => (el.textContent ?? "").trim()).filter(Boolean)`,
    );
    if (!Array.isArray(value)) throw new Error("YOLO WEB selector query returned no list");
    return value.join("\n");
  }, options);
}

export interface YoloWebBatchJob {
  id: string;
  status: "completed" | "failed";
  stats: { total: number; saved: number; failed: number };
}

/**
 * Sequential batch capture: each URL is rendered through YOLO WEB and its HTML written to
 * `<outputDir>/<sha256(url)>.html`. A batch runs to completion inside `crawl`; yolo-web has no
 * persistent queue, so `status` only knows batches submitted by this instance.
 */
export class YoloWebBatchCapture {
  private readonly jobs = new Map<string, YoloWebBatchJob>();

  constructor(
    private readonly outputDir: string,
    private readonly options: YoloWebOptions = {},
  ) {}

  async crawl(request: { urls: string[] }): Promise<YoloWebBatchJob> {
    if (request.urls.length < 1 || request.urls.length > 10)
      throw new Error("YOLO WEB requires 1 to 10 seed URLs");
    for (const url of request.urls) assertPageUrl(url);
    await mkdir(this.outputDir, { recursive: true });
    const id = createHash("sha256").update(request.urls.join("\n")).digest("hex").slice(0, 16);
    let saved = 0;
    await withYoloWeb(async (mcp) => {
      for (const url of request.urls) {
        try {
          const page = await mcp.capture(url);
          const name = createHash("sha256").update(url).digest("hex");
          await writeFile(join(this.outputDir, `${name}.html`), page.content);
          saved++;
        } catch {
          // counted as failed below
        }
      }
    }, this.options);
    const job: YoloWebBatchJob = {
      id,
      status: saved === request.urls.length ? "completed" : "failed",
      stats: { total: request.urls.length, saved, failed: request.urls.length - saved },
    };
    this.jobs.set(id, job);
    return job;
  }

  async status(id: string): Promise<YoloWebBatchJob> {
    const job = this.jobs.get(id);
    if (!job) throw Object.assign(new Error("YOLO WEB batch is unknown"), { status: 404 });
    return job;
  }
}

export interface YoloWebProbe {
  server: { name?: string; version?: string };
  tools: number;
  hasBrowserTools: boolean;
  /** CDP endpoint the browser tools will use, and what answered on it. */
  cdp: { endpoint: string; browser: string };
}

/**
 * Honest status probe of the transport: spawns `web-cli mcp`, completes the MCP handshake,
 * lists the tools, then reads `<cdp endpoint>/json/version` (the same endpoint the
 * `browser_*` tools connect to). Any failing step throws; nothing is assumed.
 */
export async function probeYoloWeb(
  options: YoloWebOptions & { fetcher?: typeof fetch } = {},
): Promise<YoloWebProbe> {
  const env = { ...process.env, ...options.env };
  const endpoint = (
    env.YOLO_CDP_ENDPOINT?.trim() || `http://127.0.0.1:${env.YOLO_CDP_PORT?.trim() || "9222"}`
  ).replace(/\/$/, "");
  const mcp = new YoloWebMcp({ ...options, timeoutMs: options.timeoutMs ?? 10_000 });
  try {
    const tools = await mcp.listTools();
    const response = await (options.fetcher ?? fetch)(`${endpoint}/json/version`, {
      headers: env.YOLO_CDP_TOKEN ? { authorization: `Bearer ${env.YOLO_CDP_TOKEN}` } : {},
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`CDP ${endpoint} answered HTTP ${response.status}`);
    const version = (await response.json()) as { Browser?: string };
    return {
      server: mcp.serverInfo,
      tools: tools.length,
      hasBrowserTools: tools.some((tool) => tool.name === "browser_navigate"),
      cdp: { endpoint, browser: version.Browser ?? "unknown" },
    };
  } finally {
    mcp.close();
  }
}
