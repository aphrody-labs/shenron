// SPDX-License-Identifier: Apache-2.0
/** Authenticated crawl jobs and index access owned by Aphrody Web. */
import { requestJson } from "@aphrody/http";
import { runAphrodyCli, type AphrodyCliOptions, type CliResult } from "./cli";

export interface AphrodyWebScrapeOptions extends Omit<AphrodyCliOptions, "json"> {
  profile?: "static" | "http" | "fast" | "stealth" | "max";
  selector?: string;
  max?: number;
}

export type AphrodyScrapeProfile = "static" | "http" | "render";

export interface AphrodyScrapeResult {
  url: string;
  status: number;
  title: string;
  content: string;
}

export interface AphrodyScrapeOptions {
  baseUrl?: string;
  token?: string;
  profile?: AphrodyScrapeProfile;
  fetcher?: typeof fetch;
}

/** Captures source HTML through Aphrody Web's authenticated, server hosted API. */
export async function scrapeWithAphrody(
  url: string,
  options: AphrodyScrapeOptions = {},
): Promise<AphrodyScrapeResult> {
  const target = new URL(url);
  if (!["https:", "http:"].includes(target.protocol) || target.username || target.password) {
    throw new Error("Aphrody Web requires an HTTP(S) page URL without credentials");
  }
  const origin = new URL(
    options.baseUrl ?? process.env.APHRODY_WEB_API_URL ?? "https://aphrody.com",
  );
  if (
    (origin.protocol !== "https:" &&
      !(
        origin.protocol === "http:" && ["127.0.0.1", "[::1]", "localhost"].includes(origin.hostname)
      )) ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash
  ) {
    throw new Error("Aphrody Web API URL must use HTTPS or loopback HTTP");
  }
  const token =
    options.token ?? process.env.APHRODY_WEB_API_TOKEN ?? process.env.APHRODY_BXC_API_TOKEN;
  if (!token?.trim())
    throw new Error("APHRODY_WEB_API_TOKEN is not configured (legacy APHRODY_BXC_API_TOKEN)");
  const localListener =
    origin.protocol === "http:" &&
    origin.port === "3007" &&
    ["127.0.0.1", "[::1]", "localhost"].includes(origin.hostname);
  const endpoint = new URL(localListener ? "/api/v1/scrape" : "/api/v1/web/scrape", origin);
  // The bearer token never follows a redirect; one deadline covers the request and the body.
  const { response, value } = await requestJson(
    endpoint,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ url: target.href, profile: options.profile ?? "static" }),
    },
    { timeoutMs: 60_000, fetch: options.fetcher },
  );
  if (!response.ok) throw new Error(`Aphrody Web scrape HTTP ${response.status}`);
  const result = (value ?? {}) as Partial<AphrodyScrapeResult>;
  if (
    result.url !== target.href ||
    typeof result.status !== "number" ||
    typeof result.title !== "string" ||
    typeof result.content !== "string"
  ) {
    throw new Error("Aphrody Web scrape returned an invalid page");
  }
  if (result.status < 200 || result.status >= 300)
    throw new Error(`Aphrody Web page HTTP ${result.status}`);
  return result as AphrodyScrapeResult;
}

export interface AphrodyWebCrawlRequest {
  urls: string[];
  allowedDomains?: string[];
  maxDepth?: number;
  maxRequests?: number;
  maxConcurrency?: number;
  perHostDelayMs?: number;
  maxPerHost?: number;
  maxRetries?: number;
  obeyRobots?: boolean;
  sitemaps?: boolean;
  /** Conservative compatibility bound from available native source; not a binary capacity claim. */
  maxSitemaps?: number;
  /** Rust regular expressions, repeated as individual native flags. */
  includeUrlRegex?: string[];
  excludeUrlRegex?: string[];
  goal?: string;
  /** Scheduling revisits requires the same persistent frontier on subsequent runs. */
  revisit?: boolean;
  sqlite?: string;
}

export interface AphrodyWebCrawlReport {
  attempts: number;
  pages: Array<{ url: string; title?: string; markdown?: string; [key: string]: unknown }>;
  errors: Array<{ url: string; error: string } | [string, string]>;
  frontier?: Record<string, number>;
}

/** Scrapes one page through the shared Aphrody Web Rust CLI and returns Markdown. */
export async function aphrodyWebScrape(
  url: string,
  options: AphrodyWebScrapeOptions = {},
): Promise<string> {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("Aphrody Web scrape requires an HTTP(S) URL without credentials");
  }
  const args = ["web", "scrape", url];
  if (options.selector) args.push(options.selector);
  else args.push("--markdown");
  args.push("--profile", options.profile ?? "static");
  if (options.max !== undefined) args.push("--max", String(options.max));
  const result = await runAphrodyCli(args, { timeoutMs: 120_000, ...options });
  if (result.kind === "exit" && result.ok) return result.stdout.trimEnd();
  throw new Error(formatCliError(result));
}

/** Fetches a JSON reconnaissance report through Aphrody Web. */
export async function aphrodyWebRecon<T = Record<string, unknown>>(
  url: string,
  options: AphrodyWebScrapeOptions = {},
): Promise<T> {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("Aphrody Web recon requires an HTTP(S) URL without credentials");
  }
  const result: CliResult<T> = await runAphrodyCli<T>(
    ["web", "recon", url, "--json", "--profile", options.profile ?? "static"],
    {
      timeoutMs: 120_000,
      ...options,
      json: true,
    },
  );
  if (result.kind === "exit" && result.ok) return result.data as T;
  throw new Error(formatCliError(result));
}

/** Runs a bounded, persistent crawl through the Aphrody Web Rust frontier. */
export async function aphrodyWebCrawl(
  request: AphrodyWebCrawlRequest,
  options: Omit<AphrodyCliOptions, "json"> = {},
): Promise<AphrodyWebCrawlReport> {
  if (!Array.isArray(request.urls) || !request.urls.length)
    throw new Error("Aphrody Web crawl requires at least one seed URL");
  const seedDomains = new Set<string>();
  for (const raw of request.urls) {
    if (typeof raw !== "string" || raw.includes("\0"))
      throw new TypeError("Crawl seed URLs require strings without NUL");
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      throw new Error("Aphrody Web crawl requires HTTP(S) URLs without credentials");
    }
    seedDomains.add(url.hostname);
  }
  const integer = (
    value: number | undefined,
    fallback: number,
    minimum: number,
    name: string,
    maximum = 0xffffffff,
  ) => {
    const selected = value === undefined ? fallback : value;
    if (!Number.isSafeInteger(selected) || selected < minimum || selected > maximum)
      throw new RangeError(`${name} must be an integer between ${minimum} and ${maximum}`);
    return selected;
  };
  const text = (value: unknown, name: string, maximum = 4096): string => {
    if (
      typeof value !== "string" ||
      !value.trim() ||
      value.includes("\0") ||
      value.length > maximum
    )
      throw new TypeError(`${name} requires a nonempty bounded string without NUL`);
    return value;
  };
  for (const key of ["obeyRobots", "sitemaps", "revisit"] as const)
    if (request[key] !== undefined && typeof request[key] !== "boolean")
      throw new TypeError(`${key} must be boolean`);
  const allowedDomains =
    request.allowedDomains === undefined ? [...seedDomains] : request.allowedDomains;
  if (!Array.isArray(allowedDomains) || !allowedDomains.length)
    throw new TypeError("allowedDomains requires exact seed hostnames");
  for (const domain of allowedDomains) {
    text(domain, "allowedDomains", 253);
    if (
      !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(domain) ||
      domain
        .split(".")
        .some(
          (label) => !label || label.length > 63 || label.startsWith("-") || label.endsWith("-"),
        ) ||
      new URL(`https://${domain}`).hostname !== domain
    )
      throw new TypeError(
        "allowedDomains must contain canonical exact hostnames without wildcards, ports or paths",
      );
  }
  if ([...seedDomains].some((domain) => !allowedDomains.includes(domain)))
    throw new Error("Every crawl seed must belong to an explicitly allowed domain");
  const numeric = {
    maxDepth: integer(request.maxDepth, 3, 0, "maxDepth"),
    maxRequests: integer(request.maxRequests, 100, 1, "maxRequests"),
    maxConcurrency: integer(request.maxConcurrency, 2, 1, "maxConcurrency"),
    perHostDelayMs: integer(request.perHostDelayMs, 1000, 0, "perHostDelayMs"),
    maxPerHost: integer(request.maxPerHost, 1, 1, "maxPerHost"),
    maxRetries: integer(request.maxRetries, 3, 0, "maxRetries"),
  };
  const maxSitemaps =
    request.maxSitemaps === undefined
      ? undefined
      : integer(request.maxSitemaps, 25, 1, "maxSitemaps", 100);
  if (maxSitemaps !== undefined && !request.sitemaps)
    throw new Error("maxSitemaps requires sitemaps discovery");
  if (request.sqlite !== undefined) text(request.sqlite, "sqlite");
  if (request.revisit && !request.sqlite)
    throw new Error("Revisit scheduling requires a persistent sqlite frontier");
  if (request.goal !== undefined) text(request.goal, "goal");
  for (const key of ["includeUrlRegex", "excludeUrlRegex"] as const) {
    const patterns = request[key];
    if (patterns !== undefined) {
      if (!Array.isArray(patterns)) throw new TypeError(`${key} must be an array`);
      for (const pattern of patterns) text(pattern, key);
    }
  }
  const args = [
    "web",
    "crawl",
    ...request.urls,
    "--max-depth",
    String(numeric.maxDepth),
    "--max-requests",
    String(numeric.maxRequests),
    "--concurrency",
    String(numeric.maxConcurrency),
    "--per-host-delay",
    String(numeric.perHostDelayMs),
    "--max-per-host",
    String(numeric.maxPerHost),
    "--max-retries",
    String(numeric.maxRetries),
    "--json",
  ];
  args.push("--allowed-domains", [...new Set(allowedDomains)].join(","));
  if (request.obeyRobots !== false) args.push("--obey-robots");
  if (request.sitemaps) args.push("--sitemaps");
  if (maxSitemaps !== undefined) args.push("--max-sitemaps", String(maxSitemaps));
  for (const pattern of request.includeUrlRegex ?? []) args.push("--include-url-regex", pattern);
  for (const pattern of request.excludeUrlRegex ?? []) args.push("--exclude-url-regex", pattern);
  if (request.goal !== undefined) args.push("--goal", request.goal);
  if (request.revisit) args.push("--revisit");
  if (request.sqlite) args.push("--sqlite", request.sqlite);
  // The native ABI accepts at most 256 arguments; reject overflow before submission.
  if (args.length > 256) throw new RangeError("Crawl options exceed the native argument budget");
  const result = await runAphrodyCli<AphrodyWebCrawlReport>(args, {
    timeoutMs: 600_000,
    ...options,
    json: true,
  });
  if (result.kind !== "exit" || !result.ok || !result.data) {
    throw new Error(formatCliError(result));
  }
  const report = result.data;
  const counter = (value: unknown) =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  if (
    !counter(report.attempts) ||
    !Array.isArray(report.pages) ||
    !Array.isArray(report.errors) ||
    report.pages.some(
      (page) =>
        !page ||
        typeof page.url !== "string" ||
        (page.title !== undefined && typeof page.title !== "string") ||
        (page.markdown !== undefined && typeof page.markdown !== "string"),
    ) ||
    report.errors.some((error) =>
      Array.isArray(error)
        ? error.length !== 2 || error.some((value) => typeof value !== "string")
        : !error || typeof error.url !== "string" || typeof error.error !== "string",
    ) ||
    (report.frontier !== undefined &&
      (!report.frontier ||
        typeof report.frontier !== "object" ||
        Array.isArray(report.frontier) ||
        Object.values(report.frontier).some((value) => !counter(value))))
  )
    throw new Error("Aphrody Web returned an invalid crawl report");
  return result.data;
}

/** Queries the shared Aphrody Google Search client and returns its structured result. */
export async function aphrodyWebSearch<T = Record<string, unknown>>(
  query: string,
  options: AphrodyCliOptions & { language?: string; region?: string; count?: number } = {},
): Promise<T> {
  if (!query.trim()) throw new Error("Aphrody Web search requires a query");
  const args = [
    "web",
    "search",
    ...query.trim().split(/\s+/),
    "--json",
    "--hl",
    options.language ?? "en",
    "--gl",
    options.region ?? "US",
    "--num",
    String(options.count ?? 10),
  ];
  const result: CliResult<T> = await runAphrodyCli<T>(args, { ...options, json: true });
  if (result.kind === "exit" && result.ok && result.data !== undefined) return result.data;
  throw new Error(formatCliError(result));
}

function formatCliError(result: CliResult): string {
  if (result.kind === "not_found")
    return `Aphrody CLI unavailable (${result.bin}): ${result.message}`;
  if (result.kind === "timeout")
    return `Aphrody CLI timed out after ${result.timeoutMs} ms: ${result.stderr.trim()}`;
  if (result.kind === "invalid_json") return `Aphrody CLI returned invalid JSON: ${result.error}`;
  return `Aphrody CLI exited ${result.code}: ${result.stderr.trim() || result.stdout.trim()}`;
}

export interface AphrodyCrawlOptions {
  baseUrl?: string;
  token?: string;
  /** HTTP proxy for this Aphrody Web API client only; defaults to the scoped user setting. */
  httpProxy?: string;
  fetcher?: typeof fetch;
}

export interface AphrodyCrawlRequest {
  urls: string[];
  allowedDomains?: string[];
  maxDepth?: number;
  maxRequests?: number;
  maxConcurrency?: number;
  profile?: "static" | "http" | "render";
}

export interface AphrodyCrawlJob {
  id: string;
  status: "running" | "completed" | "partial" | "limit_reached" | "failed";
  stats: Record<string, unknown>;
  startedAt?: string;
  finishedAt?: string;
}

export class AphrodyWebClient {
  private readonly baseUrl: URL;
  private readonly token: string;
  private readonly fetcher: typeof fetch;
  private readonly apiPrefix: string;

  constructor(options: AphrodyCrawlOptions = {}) {
    this.baseUrl = new URL(
      options.baseUrl ?? process.env.APHRODY_WEB_API_URL ?? "https://aphrody.com",
    );
    if (
      (this.baseUrl.protocol !== "https:" &&
        !(
          this.baseUrl.protocol === "http:" &&
          ["127.0.0.1", "[::1]", "localhost"].includes(this.baseUrl.hostname)
        )) ||
      this.baseUrl.username ||
      this.baseUrl.password
    ) {
      throw new Error("Aphrody Web URL must use HTTPS or loopback HTTP");
    }
    this.token =
      options.token ?? process.env.APHRODY_WEB_API_TOKEN ?? process.env.APHRODY_BXC_API_TOKEN ?? "";
    if (!this.token.trim()) throw new Error("Aphrody Web token is not configured");
    const httpProxy = options.httpProxy ?? process.env.APHRODY_WEB_HTTP_PROXY?.trim();
    this.fetcher =
      options.fetcher ??
      (((input, init) => {
        const requestInit = httpProxy
          ? { ...init, proxy: { url: httpProxy, respectNoProxy: false } }
          : init;
        return (fetch as unknown as (input: unknown, init?: unknown) => Promise<Response>)(
          input,
          requestInit,
        );
      }) as typeof fetch);
    this.apiPrefix =
      this.baseUrl.protocol === "http:" &&
      this.baseUrl.port === "3007" &&
      ["127.0.0.1", "[::1]", "localhost"].includes(this.baseUrl.hostname)
        ? "/api/v1"
        : "/api/v1/web";
  }

  private async request(
    path: string,
    body?: unknown,
  ): Promise<{ success?: unknown; job?: unknown }> {
    const url = new URL(path, this.baseUrl);
    const response = await this.fetcher(url, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        authorization: `Bearer ${this.token}`,
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok)
      throw Object.assign(new Error(`Aphrody Web HTTP ${response.status} on ${url.pathname}`), {
        status: response.status,
      });
    return (await response.json()) as { success?: unknown; job?: unknown };
  }

  private job(value: unknown): AphrodyCrawlJob {
    const row = value as Record<string, unknown> | null;
    if (
      !row ||
      typeof row.id !== "string" ||
      !["running", "completed", "partial", "limit_reached", "failed"].includes(
        String(row.status),
      ) ||
      !row.stats ||
      typeof row.stats !== "object"
    ) {
      throw new Error("Aphrody Web returned an invalid crawl job");
    }
    return row as unknown as AphrodyCrawlJob;
  }

  async crawl(request: AphrodyCrawlRequest): Promise<AphrodyCrawlJob> {
    if (
      request.urls.length < 1 ||
      request.urls.length > 10 ||
      request.urls.some((url) => {
        const parsed = new URL(url);
        return (
          !["http:", "https:"].includes(parsed.protocol) ||
          Boolean(parsed.username || parsed.password)
        );
      })
    ) {
      throw new Error("Aphrody Web requires 1 to 10 HTTP(S) seed URLs");
    }
    const result = await this.request(`${this.apiPrefix}/crawl`, request);
    if (result.success !== true) throw new Error("Aphrody Web did not accept the crawl");
    return this.job(result.job);
  }

  async status(jobId: string): Promise<AphrodyCrawlJob> {
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) throw new Error("Invalid Aphrody Web crawl job ID");
    const result = await this.request(
      `${this.apiPrefix}/crawl/stats?jobId=${encodeURIComponent(jobId)}`,
    );
    if (result.success !== true) throw new Error("Aphrody Web crawl job is unavailable");
    return this.job(result.job);
  }
}
