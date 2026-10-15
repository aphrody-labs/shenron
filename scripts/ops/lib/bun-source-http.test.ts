// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { acquire, type AcquireOptions, type CurlProvider } from "./bun-source-http";

function fetchMock(
  handler: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>,
): typeof fetch {
  return Object.assign(handler, { preconnect: () => {} });
}

function options(origin: string, overrides: Partial<AcquireOptions> = {}): AcquireOptions {
  return {
    transport: "fetch",
    allowedOrigins: [origin],
    maxBytes: 1024,
    timeoutMs: 2000,
    retries: 0,
    ...overrides,
  };
}

describe("bounded native source HTTP", () => {
  test("fetch returns exact bytes, MIME, checksum and final URL", async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => new Response("abc", { headers: { "content-type": "text/plain" } }),
    });
    try {
      const result = await acquire(server.url, options(server.url.origin));
      expect(new TextDecoder().decode(result.bytes)).toBe("abc");
      expect(result.contentType).toBe("text/plain");
      expect(result.status).toBe(200);
      expect(result.finalUrl).toBe(server.url.href);
      expect(result.sha256).toBe(
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      );
    } finally {
      await server.stop(true);
    }
  });

  test("forbidden redirect destination receives no network request", async () => {
    let forbiddenHits = 0;
    const forbidden = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => {
        forbiddenHits++;
        return new Response("forbidden");
      },
    });
    const allowed = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => Response.redirect(forbidden.url),
    });
    try {
      await expect(acquire(allowed.url, options(allowed.url.origin))).rejects.toMatchObject({
        code: "ERR_SOURCE_ORIGIN",
      });
      expect(forbiddenHits).toBe(0);
    } finally {
      await Promise.all([allowed.stop(true), forbidden.stop(true)]);
    }
  });

  test("allowed relative redirect resolves and obeys hop bound", async () => {
    let hits = 0;
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: (request) => {
        hits++;
        return new URL(request.url).pathname === "/done"
          ? new Response("done")
          : new Response(null, { status: 302, headers: { location: "/done" } });
      },
    });
    try {
      const result = await acquire(server.url, options(server.url.origin, { maxRedirects: 1 }));
      expect(result.finalUrl).toBe(new URL("/done", server.url).href);
      expect(new TextDecoder().decode(result.bytes)).toBe("done");
      expect(hits).toBe(2);
      await expect(
        acquire(server.url, options(server.url.origin, { maxRedirects: 0 })),
      ).rejects.toMatchObject({ code: "ERR_SOURCE_REDIRECTS" });
      expect(hits).toBe(3);
    } finally {
      await server.stop(true);
    }
  });

  test("redirect cycles stop before exceeding their network budget", async () => {
    let hits = 0;
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => {
        hits++;
        return new Response(null, { status: 307, headers: { location: "/loop" } });
      },
    });
    try {
      await expect(
        acquire(server.url, options(server.url.origin, { maxRedirects: 2 })),
      ).rejects.toMatchObject({ code: "ERR_SOURCE_REDIRECTS" });
      expect(hits).toBe(3);
    } finally {
      await server.stop(true);
    }
  });

  test("retries transient HTTP status and preserves terminal status", async () => {
    let hits = 0;
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: (request) => {
        hits++;
        return new Response("source", {
          status: new URL(request.url).pathname === "/missing" ? 404 : hits === 1 ? 503 : 200,
        });
      },
    });
    try {
      expect((await acquire(server.url, options(server.url.origin, { retries: 2 }))).status).toBe(
        200,
      );
      expect(hits).toBe(2);
      await expect(
        acquire(new URL("/missing", server.url), options(server.url.origin, { retries: 2 })),
      ).rejects.toMatchObject({ code: "ERR_SOURCE_STATUS", status: 404 });
      expect(hits).toBe(3);
    } finally {
      await server.stop(true);
    }
  });

  test("exhausted retries retain original HTTP status", async () => {
    let hits = 0;
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => {
        hits++;
        return new Response("busy", { status: 429 });
      },
    });
    try {
      await expect(
        acquire(server.url, options(server.url.origin, { retries: 1 })),
      ).rejects.toMatchObject({ code: "ERR_SOURCE_STATUS", status: 429 });
      expect(hits).toBe(2);
    } finally {
      await server.stop(true);
    }
  });

  test("stream cap applies without a Content-Length header and cancels body", async () => {
    let canceled = false;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.enqueue(new Uint8Array([4, 5]));
        },
        cancel() {
          canceled = true;
        },
      }),
    );
    await expect(
      acquire("https://source.test/", options("https://source.test", { maxBytes: 4 }), {
        fetch: fetchMock(async () => response),
      }),
    ).rejects.toMatchObject({ code: "ERR_SOURCE_TOO_LARGE" });
    expect(canceled).toBe(true);
  });

  test("body at exact byte limit succeeds and oversized network response fails", async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => new Response("12345"),
    });
    try {
      expect(
        (await acquire(server.url, options(server.url.origin, { maxBytes: 5 }))).bytes.byteLength,
      ).toBe(5);
      await expect(
        acquire(server.url, options(server.url.origin, { maxBytes: 4 })),
      ).rejects.toMatchObject({ code: "ERR_SOURCE_TOO_LARGE" });
    } finally {
      await server.stop(true);
    }
  });

  test("cancellation preserves caller reason during a streaming response", async () => {
    const started = Promise.withResolvers<void>();
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("a"));
              started.resolve();
            },
          }),
        ),
    });
    const controller = new AbortController();
    const reason = new Error("caller canceled source");
    try {
      const pending = acquire(
        server.url,
        options(server.url.origin, { signal: controller.signal }),
      );
      await started.promise;
      controller.abort(reason);
      await expect(pending).rejects.toBe(reason);
    } finally {
      controller.abort(reason);
      await server.stop(true);
    }
  });

  test("total deadline covers stalled streamed response", async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("a"));
            },
          }),
        ),
    });
    try {
      await expect(
        acquire(server.url, options(server.url.origin, { timeoutMs: 100 })),
      ).rejects.toMatchObject({ name: "TimeoutError" });
    } finally {
      await server.stop(true);
    }
  });

  test("curl unavailable is explicit and never invokes fetch fallback", async () => {
    let fetchCalls = 0;
    await expect(
      acquire("https://source.test/", options("https://source.test", { transport: "curl" }), {
        curl: null,
        fetch: fetchMock(async () => {
          fetchCalls++;
          return new Response("fallback");
        }),
      }),
    ).rejects.toMatchObject({ code: "ERR_CURL_PROVIDER_UNAVAILABLE" });
    expect(fetchCalls).toBe(0);
  });

  test("curl uses declared native request options and manual origin validation", async () => {
    const calls: string[] = [];
    const curl: CurlProvider = {
      available: true,
      async request(url, requestOptions) {
        calls.push(url);
        expect(requestOptions.followRedirects).toBe(false);
        expect(requestOptions.maxRedirects).toBe(0);
        expect(requestOptions.maxBytes).toBe(1024);
        expect(requestOptions.timeout).toBeGreaterThan(0);
        expect(requestOptions.signal.aborted).toBe(false);
        return calls.length === 1
          ? {
              status: 302,
              body: new Blob(),
              headers: "HTTP/1.1 302 Found\r\nLocation: /done\r\n\r\n",
            }
          : {
              status: 200,
              body: new Blob(["native"]),
              headers:
                "HTTP/1.1 100 Continue\r\nX-Interim: ignored\r\n\r\nHTTP/2 200\r\nContent-Type: application/json\r\n\r\n",
            };
      },
    };
    const result = await acquire(
      "https://source.test/",
      options("https://source.test", { transport: "curl" }),
      { curl },
    );
    expect(calls).toEqual(["https://source.test/", "https://source.test/done"]);
    expect(new TextDecoder().decode(result.bytes)).toBe("native");
    expect(result.contentType).toBe("application/json");
    expect(result.finalUrl).toBe("https://source.test/done");
  });

  test("invalid settings and forbidden initial origin fail before network", async () => {
    let hits = 0;
    const dependencies = {
      fetch: fetchMock(async () => {
        hits++;
        return new Response("unexpected");
      }),
    };
    await expect(
      acquire("https://forbidden.test/", options("https://source.test"), dependencies),
    ).rejects.toMatchObject({ code: "ERR_SOURCE_ORIGIN" });
    await expect(
      acquire(
        "https://source.test/",
        options("https://source.test", { maxBytes: 0 }),
        dependencies,
      ),
    ).rejects.toBeInstanceOf(RangeError);
    await expect(
      acquire("https://user:password@source.test/", options("https://source.test"), dependencies),
    ).rejects.toMatchObject({ code: "ERR_SOURCE_URL" });
    expect(hits).toBe(0);
  });

  test("curl refuses forbidden redirect before requesting its destination", async () => {
    let calls = 0;
    const curl: CurlProvider = {
      available: true,
      async request() {
        calls++;
        return {
          status: 302,
          body: new Blob(),
          headers: "HTTP/1.1 302 Found\r\nLocation: https://forbidden.test/\r\n\r\n",
        };
      },
    };
    await expect(
      acquire("https://source.test/", options("https://source.test", { transport: "curl" }), {
        curl,
      }),
    ).rejects.toMatchObject({ code: "ERR_SOURCE_ORIGIN" });
    expect(calls).toBe(1);
  });

  test("already canceled acquisition never invokes network", async () => {
    const controller = new AbortController();
    const reason = new Error("already canceled");
    controller.abort(reason);
    let calls = 0;
    await expect(
      acquire(
        "https://source.test/",
        options("https://source.test", { signal: controller.signal }),
        {
          fetch: fetchMock(async () => {
            calls++;
            return new Response("unexpected");
          }),
        },
      ),
    ).rejects.toBe(reason);
    expect(calls).toBe(0);
  });

  test("one total deadline bounds retries and retry backoff", async () => {
    let calls = 0;
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => {
        calls++;
        return new Response("busy", { status: 503 });
      },
    });
    try {
      await expect(
        acquire(server.url, options(server.url.origin, { retries: 5, timeoutMs: 50 })),
      ).rejects.toMatchObject({ name: "TimeoutError" });
      expect(calls).toBe(1);
    } finally {
      await server.stop(true);
    }
  });

  test("network failures preserve original error after bounded attempts", async () => {
    const original = new TypeError("provider connection failed");
    let attempts = 0;
    await expect(
      acquire("https://source.test/", options("https://source.test", { retries: 1 }), {
        fetch: fetchMock(async () => {
          attempts++;
          throw original;
        }),
      }),
    ).rejects.toBe(original);
    expect(attempts).toBe(2);
  });
});
