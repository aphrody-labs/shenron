// SPDX-License-Identifier: Apache-2.0
/**
 * YOLO WEB backend (github.com/yolo-rs/yolo-web): page capture through its MCP server
 * (`YOLO_WEB_MCP_URL`, streamable HTTP `/mcp`: browser_navigate, browser_evaluate,
 * browser_markdown, browser_screenshot, browser_storage_state) and crawl queue through the
 * web-cluster coordinator (`YOLO_WEB_API_URL`: POST /enqueue, GET /status, GET /results).
 * No default host: a missing URL is a configuration error, never a silent fallback.
 */
import { requestJson } from "@aphrody/http";

const LOOPBACK = new Set(["127.0.0.1", "[::1]", "localhost"]);

export class YoloWebNotConfiguredError extends Error {
  constructor(variable: string) {
    super(`${variable} is not configured (YOLO WEB endpoint required)`);
    this.name = "YoloWebNotConfiguredError";
  }
}

export interface YoloWebOptions {
  baseUrl?: string;
  token?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

export function resolveYoloWebUrl(variable: string, explicit?: string): URL {
  const raw = (explicit ?? process.env[variable])?.trim();
  if (!raw) throw new YoloWebNotConfiguredError(variable);
  const url = new URL(raw);
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && LOOPBACK.has(url.hostname))) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${variable} must use HTTPS or loopback HTTP, without credentials`);
  }
  return url;
}

function headers(token: string | undefined, extra: Record<string, string> = {}) {
  const bearer = token?.trim();
  return {
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    ...extra,
  };
}

function assertPageUrl(url: string): URL {
  const target = new URL(url);
  if (!["http:", "https:"].includes(target.protocol) || target.username || target.password)
    throw new Error("YOLO WEB requires an HTTP(S) page URL without credentials");
  return target;
}

export interface YoloWebPage {
  url: string;
  title: string;
  /** Rendered document HTML (`document.documentElement.outerHTML`). */
  content: string;
}

/** Minimal MCP streamable-HTTP client for the yolo-web tool server. */
export class YoloWebMcp {
  private readonly endpoint: URL;
  private readonly fetcher: typeof fetch;
  private sessionId: string | undefined;
  private initialized = false;
  private nextId = 1;

  constructor(private readonly options: YoloWebOptions = {}) {
    const base = resolveYoloWebUrl("YOLO_WEB_MCP_URL", options.baseUrl);
    this.endpoint = new URL("/mcp", base);
    this.fetcher = options.fetcher ?? fetch;
  }

  private async rpc(method: string, params?: unknown, notify = false): Promise<unknown> {
    const body: Record<string, unknown> = { jsonrpc: "2.0", method, params };
    if (!notify) body.id = this.nextId++;
    const response = await this.fetcher(this.endpoint, {
      method: "POST",
      headers: headers(
        this.options.token ?? process.env.YOLO_WEB_API_TOKEN,
        this.sessionId ? { "mcp-session-id": this.sessionId } : {},
      ),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 60_000),
    });
    if (!response.ok) throw new Error(`YOLO WEB MCP HTTP ${response.status} on ${method}`);
    this.sessionId ??= response.headers.get("mcp-session-id") ?? undefined;
    if (notify) return undefined;
    const text = await response.text();
    const payload = response.headers.get("content-type")?.includes("text/event-stream")
      ? text
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .at(-1)
      : text;
    const message = JSON.parse(payload ?? "null") as {
      result?: unknown;
      error?: { message?: string };
    };
    if (message.error) throw new Error(`YOLO WEB MCP ${method}: ${message.error.message}`);
    return message.result;
  }

  async connect(): Promise<void> {
    if (this.initialized) return;
    await this.rpc("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "shenron-pipeline", version: "1" },
    });
    await this.rpc("notifications/initialized", undefined, true);
    this.initialized = true;
  }

  /** Calls one MCP tool and returns its JSON text content (or raw text). */
  async tool<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    await this.connect();
    const result = (await this.rpc("tools/call", { name, arguments: args })) as {
      isError?: boolean;
      content?: Array<{ type: string; text?: string }>;
    };
    const text = result.content?.find((part) => part.type === "text")?.text ?? "";
    if (result.isError) throw new Error(`YOLO WEB tool ${name} failed: ${text.slice(0, 200)}`);
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  }

  /** Renders a page in the YOLO WEB browser and returns its HTML. */
  async capture(url: string): Promise<YoloWebPage> {
    const target = assertPageUrl(url);
    await this.tool("browser_navigate", { url: target.href });
    const evaluated = await this.tool<{ result?: { value?: { title?: string; html?: string } } }>(
      "browser_evaluate",
      { script: "({ title: document.title, html: document.documentElement.outerHTML })" },
    );
    const value = evaluated.result?.value;
    if (typeof value?.html !== "string") throw new Error("YOLO WEB returned no page HTML");
    return { url: target.href, title: value.title ?? "", content: value.html };
  }

  async markdown(url: string): Promise<string> {
    await this.tool("browser_navigate", { url: assertPageUrl(url).href });
    const out = await this.tool<unknown>("browser_markdown");
    return typeof out === "string" ? out : JSON.stringify(out);
  }

  screenshot(args: Record<string, unknown> = {}) {
    return this.tool("browser_screenshot", args);
  }

  storageState() {
    return this.tool("browser_storage_state");
  }
}

/** Captures rendered page HTML through YOLO WEB. */
export function scrapeWithYoloWeb(url: string, options: YoloWebOptions = {}): Promise<YoloWebPage> {
  return new YoloWebMcp(options).capture(url);
}

export interface YoloWebCrawlStatus {
  queued: number;
  workers: number;
  observers: number;
  jobs: Record<string, number>;
}

export interface YoloWebCrawlRow {
  id: number;
  url: string;
  mode: string;
  status: string;
  worker: string | null;
  http_status: number | null;
  title: string | null;
  elapsed_ms: number | null;
}

/** web-cluster coordinator client (queue, status, results). */
export class YoloWebCrawlClient {
  private readonly base: URL;
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: YoloWebOptions = {}) {
    this.base = resolveYoloWebUrl("YOLO_WEB_API_URL", options.baseUrl);
    this.fetcher = options.fetcher ?? fetch;
  }

  private async call<T>(path: string, body?: unknown): Promise<T> {
    const url = new URL(path, this.base);
    const { response, value } = await requestJson(
      url,
      {
        method: body === undefined ? "GET" : "POST",
        headers: headers(this.options.token ?? process.env.YOLO_WEB_API_TOKEN),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
      { timeoutMs: this.options.timeoutMs ?? 30_000, fetch: this.fetcher },
    );
    if (!response.ok)
      throw Object.assign(new Error(`YOLO WEB HTTP ${response.status} on ${url.pathname}`), {
        status: response.status,
      });
    return value as T;
  }

  /** Queues 1 to 10 HTTP(S) URLs; `cdp` mode renders JavaScript pages. */
  async enqueue(urls: string[], mode: "fetch" | "cdp" = "fetch"): Promise<number[]> {
    if (urls.length < 1 || urls.length > 10) throw new Error("YOLO WEB requires 1 to 10 seed URLs");
    for (const url of urls) assertPageUrl(url);
    const out = await this.call<{ enqueued?: number[] }>("/enqueue", { urls, mode });
    if (!Array.isArray(out.enqueued)) throw new Error("YOLO WEB did not accept the crawl");
    return out.enqueued;
  }

  status(): Promise<YoloWebCrawlStatus> {
    return this.call("/status");
  }

  results(): Promise<YoloWebCrawlRow[]> {
    return this.call("/results");
  }
}

export interface YoloWebBatchJob {
  id: string;
  status: "running" | "completed" | "failed";
  stats: Record<string, unknown>;
}

/**
 * Batch view over the coordinator queue: a job is the set of queue rows created by one
 * `enqueue` call, identified as `"<id>,<id>,..."`. A job whose rows are unknown to the
 * coordinator is reported with HTTP status 404 so callers may resubmit it.
 */
export class YoloWebBatchClient {
  private readonly queue: YoloWebCrawlClient;

  constructor(options: YoloWebOptions = {}) {
    this.queue = new YoloWebCrawlClient(options);
  }

  async crawl(request: { urls: string[]; mode?: "fetch" | "cdp" }): Promise<YoloWebBatchJob> {
    const ids = await this.queue.enqueue(request.urls, request.mode ?? "fetch");
    return { id: ids.join(","), status: "running", stats: { enqueued: ids.length } };
  }

  async status(jobId: string): Promise<YoloWebBatchJob> {
    if (!/^\d+(,\d+)*$/.test(jobId)) throw new Error("Invalid YOLO WEB crawl job ID");
    const wanted = new Set(jobId.split(",").map(Number));
    const rows = (await this.queue.results()).filter((row) => wanted.has(row.id));
    if (rows.length !== wanted.size)
      throw Object.assign(new Error("YOLO WEB crawl job is unavailable"), { status: 404 });
    const failed = rows.filter((row) => row.status === "failed" || row.status === "error").length;
    const done = rows.filter((row) => row.status === "done").length;
    return {
      id: jobId,
      status: done + failed < rows.length ? "running" : failed ? "failed" : "completed",
      stats: { total: rows.length, done, failed },
    };
  }
}

export interface YoloWebScrapeOptions extends YoloWebOptions {
  /** CSS selector: returns the trimmed text of each match, one per line, instead of Markdown. */
  selector?: string;
  /** Maximum number of selector matches. */
  max?: number;
}

/** Page Markdown (or selector text) through YOLO WEB `YOLO_WEB_MCP_URL`; throws when unconfigured. */
export async function yoloWebScrape(
  url: string,
  options: YoloWebScrapeOptions = {},
): Promise<string> {
  const mcp = new YoloWebMcp(options);
  if (!options.selector) return mcp.markdown(url);
  await mcp.tool("browser_navigate", { url: assertPageUrl(url).href });
  const out = await mcp.tool<{ result?: { value?: unknown } }>("browser_evaluate", {
    script: `Array.from(document.querySelectorAll(${JSON.stringify(options.selector)})).slice(0, ${Math.max(1, Math.floor(options.max ?? 200))}).map((el) => (el.textContent ?? "").trim()).filter(Boolean)`,
  });
  const value = out.result?.value;
  if (!Array.isArray(value)) throw new Error("YOLO WEB selector query returned no list");
  return value.join("\n");
}
