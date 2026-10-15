// SPDX-License-Identifier: Apache-2.0

export interface CurlProvider {
  readonly available: boolean;
  request(
    url: string,
    options: {
      timeout: number;
      maxBytes: number;
      followRedirects: false;
      maxRedirects: 0;
      signal: AbortSignal;
    },
  ): Promise<{ status: number; body: Blob; headers: string }>;
}

export interface AcquireOptions {
  transport: "fetch" | "curl";
  allowedOrigins: readonly string[];
  maxBytes: number;
  timeoutMs: number;
  signal?: AbortSignal;
  maxRedirects?: number;
  retries?: number;
}

export interface AcquiredSource {
  bytes: Uint8Array;
  status: number;
  contentType: string | null;
  sha256: string;
  finalUrl: string;
}

export interface AcquireDependencies {
  fetch?: typeof fetch;
  curl?: CurlProvider | null;
}

export class SourceHttpError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SourceHttpError";
  }
}

function boundedInteger(value: number, name: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function sourceUrl(value: string | URL): URL {
  const url = new URL(value);
  const localHttp =
    url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !localHttp) || url.username || url.password) {
    throw new SourceHttpError(
      "ERR_SOURCE_URL",
      "Sources require HTTPS without URL credentials; explicit loopback HTTP fixtures are supported",
    );
  }
  return url;
}

function curlHeaders(raw: string): Headers {
  let headers = new Headers();
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("HTTP/")) {
      headers = new Headers();
      continue;
    }
    const colon = line.indexOf(":");
    if (colon > 0) headers.append(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
  }
  return headers;
}

async function cancelBody(body: ReadableStream<Uint8Array> | null): Promise<void> {
  // Cancellation is auxiliary cleanup; it must not replace the original transfer error.
  try {
    await body?.cancel();
  } catch {}
}

async function readBounded(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const abort = () => {
    void reader.cancel(signal.reason).catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    while (true) {
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        throw new SourceHttpError("ERR_SOURCE_TOO_LARGE", `Source body exceeds ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } catch (error) {
    try {
      await reader.cancel(error);
    } catch {}
    throw error;
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}

async function backoff(milliseconds: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", abort, { once: true });
  });
}

/** Acquire bytes only; MIME acceptance and expected checksum belong to the source manifest caller. */
export async function acquire(
  value: string | URL,
  options: AcquireOptions,
  dependencies: AcquireDependencies = {},
): Promise<AcquiredSource> {
  const maxBytes = boundedInteger(options.maxBytes, "maxBytes", 1, 1024 * 1024 * 1024);
  const timeoutMs = boundedInteger(options.timeoutMs, "timeoutMs", 1, 15 * 60 * 1000);
  const maxRedirects = boundedInteger(options.maxRedirects ?? 5, "maxRedirects", 0, 20);
  const retries = boundedInteger(options.retries ?? 2, "retries", 0, 5);
  const initialUrl = sourceUrl(value);
  const allowed = new Set(
    options.allowedOrigins.map((origin) => {
      const parsed = sourceUrl(origin);
      if (parsed.href !== `${parsed.origin}/`) {
        throw new SourceHttpError(
          "ERR_SOURCE_ORIGIN",
          "allowedOrigins entries must contain only an origin",
        );
      }
      return parsed.origin;
    }),
  );
  const validate = (url: URL) => {
    sourceUrl(url);
    if (!allowed.has(url.origin)) {
      throw new SourceHttpError("ERR_SOURCE_ORIGIN", `Source origin is not allowed: ${url.origin}`);
    }
  };
  validate(initialUrl);
  const curl =
    dependencies.curl === undefined
      ? (Bun as unknown as { Curl?: CurlProvider }).Curl
      : dependencies.curl;
  if (options.transport === "curl" && (!curl?.available || typeof curl.request !== "function")) {
    throw new SourceHttpError(
      "ERR_CURL_PROVIDER_UNAVAILABLE",
      "This Bun runtime does not provide Bun.Curl.request",
    );
  }
  if (options.transport !== "fetch" && options.transport !== "curl") {
    throw new SourceHttpError("ERR_SOURCE_TRANSPORT", "Source transport must be fetch or curl");
  }
  const controller = new AbortController();
  const timer = setTimeout(
    () =>
      controller.abort(new DOMException("Source acquisition deadline exceeded", "TimeoutError")),
    timeoutMs,
  );
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;
  const deadline = Date.now() + timeoutMs;
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        let current = initialUrl;
        for (let hop = 0; ; hop++) {
          signal.throwIfAborted();
          validate(current);
          let status: number;
          let headers: Headers;
          let body: ReadableStream<Uint8Array> | null;
          if (options.transport === "curl") {
            const response = await curl!.request(current.href, {
              timeout: Math.max(1, deadline - Date.now()),
              maxBytes,
              followRedirects: false,
              maxRedirects: 0,
              signal,
            });
            status = response.status;
            headers = curlHeaders(response.headers);
            body = response.body.stream();
          } else {
            const response = await (dependencies.fetch ?? fetch)(current.href, {
              redirect: "manual",
              signal,
            });
            status = response.status;
            headers = response.headers;
            body = response.body;
          }
          if ([301, 302, 303, 307, 308].includes(status)) {
            await cancelBody(body);
            if (hop >= maxRedirects) {
              throw new SourceHttpError(
                "ERR_SOURCE_REDIRECTS",
                `Source exceeds ${maxRedirects} redirects`,
                status,
              );
            }
            const location = headers.get("location");
            if (!location)
              throw new SourceHttpError(
                "ERR_SOURCE_REDIRECT",
                "Source redirect has no Location header",
                status,
              );
            current = new URL(location, current);
            validate(current);
            continue;
          }
          if (status < 200 || status >= 300) {
            await cancelBody(body);
            throw new SourceHttpError(
              "ERR_SOURCE_STATUS",
              `Source returned HTTP ${status}`,
              status,
            );
          }
          const length = headers.get("content-length");
          if (length && /^\d+$/.test(length) && BigInt(length) > BigInt(maxBytes)) {
            await cancelBody(body);
            throw new SourceHttpError(
              "ERR_SOURCE_TOO_LARGE",
              `Source body exceeds ${maxBytes} bytes`,
            );
          }
          const bytes = await readBounded(body, maxBytes, signal);
          return {
            bytes,
            status,
            contentType: headers.get("content-type"),
            sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
            finalUrl: current.href,
          };
        }
      } catch (error) {
        signal.throwIfAborted();
        const retryable =
          error instanceof SourceHttpError
            ? error.code === "ERR_SOURCE_STATUS" &&
              [408, 425, 429, 500, 502, 503, 504].includes(error.status!)
            : error instanceof TypeError;
        if (!retryable || attempt >= retries) throw error;
        await backoff(Math.min(100 * 2 ** attempt, 2000), signal);
      }
    }
  } finally {
    clearTimeout(timer);
  }
}
