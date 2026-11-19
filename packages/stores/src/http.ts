// SPDX-License-Identifier: Apache-2.0
/**
 * Polite JSON fetch for store catalogues: a descriptive User-Agent, one request at a time per host
 * with a minimum interval, a timeout, and retries that honour `Retry-After` on 429 and 503. An
 * optional proxy (`SHENRON_STORE_PROXY`, for example a SOCKS or HTTP endpoint of a VPN the operator
 * runs) changes the exit region only; it never changes what is asked. There is no CAPTCHA or
 * bot-detection handling: a challenge page is an error.
 */

export interface HttpOptions {
  /** Minimum milliseconds between two requests to the same host. */
  minIntervalMs?: number;
  timeoutMs?: number;
  retries?: number;
  userAgent?: string;
  proxy?: string | undefined;
  signal?: AbortSignal | undefined;
}

const DEFAULT_USER_AGENT = "shenron-store-sync/1 (+https://dragonballfr.com)";
const lastRequest = new Map<string, number>();
const queues = new Map<string, Promise<unknown>>();

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`${status} ${url}`);
    this.name = "HttpError";
  }
}

function retryDelayMs(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  const seconds = header ? Number(header) : Number.NaN;
  return Number.isFinite(seconds) ? Math.min(seconds, 60) * 1000 : 500 * 2 ** attempt;
}

/** GET a URL and parse JSON, serialised per host so that the minimum interval holds under concurrency. */
export async function getJson(url: string, options: HttpOptions = {}): Promise<unknown> {
  const host = new URL(url).host;
  const previous = queues.get(host) ?? Promise.resolve();
  const run = previous.then(() => request(url, host, options));
  queues.set(
    host,
    run.catch(() => undefined),
  );
  return run;
}

async function request(url: string, host: string, options: HttpOptions): Promise<unknown> {
  const retries = options.retries ?? 2;
  const minInterval = options.minIntervalMs ?? 400;
  const proxy = options.proxy ?? process.env.SHENRON_STORE_PROXY;
  for (let attempt = 0; ; attempt++) {
    const wait = (lastRequest.get(host) ?? 0) + minInterval - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest.set(host, Date.now());
    const timeout = AbortSignal.timeout(options.timeoutMs ?? 20_000);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    const response = await fetch(url, {
      headers: { "user-agent": options.userAgent ?? DEFAULT_USER_AGENT, accept: "application/json" },
      signal,
      ...(proxy ? { proxy } : {}),
    });
    if (response.ok) return response.json();
    const transient = response.status === 429 || response.status === 503;
    if (!transient || attempt >= retries) throw new HttpError(response.status, url);
    await sleep(retryDelayMs(response, attempt));
  }
}
