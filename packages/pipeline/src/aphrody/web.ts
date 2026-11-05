// SPDX-License-Identifier: Apache-2.0
/** Aphrody CLI web commands (scrape, recon, crawl, search). HTTP crawl/capture lives in ../yolo-web. */
import { runAphrodyCli, type AphrodyCliOptions, type CliResult } from "./cli";

export interface AphrodyWebScrapeOptions extends Omit<AphrodyCliOptions, "json"> {
  profile?: "static" | "http" | "fast" | "stealth" | "max";
  selector?: string;
  max?: number;
}

export interface AphrodyWebCrawlRequest {
  urls: string[];
  /** Render JavaScript pages through Playwright connected to the host's Obscura CDP engine. */
  browser?: "native" | "playwright";
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
  if (request.browser !== undefined && !["native", "playwright"].includes(request.browser))
    throw new TypeError("browser must be native or playwright");
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
  if (request.browser) args.push("--browser", request.browser);
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
