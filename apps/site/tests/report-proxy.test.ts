// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { proxyReportToHost, REPORT_RELAY_HEADER } from "../src/lib/report-proxy";
import { POST } from "../src/app/api/reports/route";

test("without a Bun host the report route fails closed without opening a local database", async () => {
  const previous = process.env.SHENRON_HOST_URL;
  delete process.env.SHENRON_HOST_URL;
  try {
    const response = await POST(
      new Request("https://dragonballfr.com/api/reports", { method: "POST", body: "{}" }),
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ error: "reports_unavailable" });
  } finally {
    if (previous === undefined) delete process.env.SHENRON_HOST_URL;
    else process.env.SHENRON_HOST_URL = previous;
  }
});

test("the real report route forwards bytes and credentials, preserving backend statuses", async () => {
  const previous = process.env.SHENRON_HOST_URL;
  const seen: { body: string; cookie: string | null; owner: string | null }[] = [];
  const backend = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      expect(new URL(request.url).pathname).toBe("/api/reports");
      seen.push({
        body: await request.text(),
        cookie: request.headers.get("cookie"),
        owner: request.headers.get("x-shenron-owner"),
      });
      return Response.json(
        { error: "rate_limited" },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    },
  });
  process.env.SHENRON_HOST_URL = backend.url.origin;
  try {
    const body = JSON.stringify({
      category: "bug",
      message: "Synthetic issue",
      path: "/desktop",
      pageTitle: null,
    });
    const response = await POST(
      new Request("https://dragonballfr.com/api/reports", {
        method: "POST",
        body,
        headers: {
          cookie: "session=valid",
          "content-type": "application/json",
          "x-shenron-owner": "forged",
        },
      }),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(seen).toEqual([{ body, cookie: "session=valid", owner: null }]);
  } finally {
    await backend.stop(true);
    if (previous === undefined) delete process.env.SHENRON_HOST_URL;
    else process.env.SHENRON_HOST_URL = previous;
  }
});

test("a front host without the report mount cannot recursively relay through Next", async () => {
  const previous = process.env.SHENRON_HOST_URL;
  let requests = 0;
  const front = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      requests++;
      return POST(request);
    },
  });
  process.env.SHENRON_HOST_URL = front.url.origin;
  try {
    const response = await POST(
      new Request("https://dragonballfr.com/api/reports", { method: "POST", body: "{}" }),
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(requests).toBe(1);
  } finally {
    await front.stop(true);
    if (previous === undefined) delete process.env.SHENRON_HOST_URL;
    else process.env.SHENRON_HOST_URL = previous;
  }
});

test("caller cancellation and deadline terminate a pending backend request", async () => {
  const backend = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Promise<Response>(() => {}),
  });
  try {
    const deadline = proxyReportToHost(
      new Request("https://dragonballfr.com/api/reports", { method: "POST", body: "{}" }),
      backend.url.origin,
      50,
    );
    await expect(deadline).rejects.toBeDefined();
    const controller = new AbortController();
    const pending = proxyReportToHost(
      new Request("https://dragonballfr.com/api/reports", {
        method: "POST",
        body: "{}",
        signal: controller.signal,
      }),
      backend.url.origin,
    );
    controller.abort();
    await expect(pending).rejects.toBeDefined();
    expect(
      (
        await proxyReportToHost(
          new Request("https://dragonballfr.com/api/reports", {
            headers: { [REPORT_RELAY_HEADER]: "1" },
          }),
          backend.url.origin,
        )
      ).status,
    ).toBe(503);
  } finally {
    await backend.stop(true);
  }
});
