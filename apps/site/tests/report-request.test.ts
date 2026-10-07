// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { sendReport } from "../src/lib/report-request";

const payload = {
  path: "/desktop",
  pageTitle: "Synthetic",
  category: "bug",
  message: "Synthetic report",
};

test("a hanging report reaches its deadline and the next submission can succeed", async () => {
  let requests = 0;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => {
      requests++;
      return requests === 1 ? new Promise<Response>(() => {}) : new Response(null, { status: 204 });
    },
  });
  const url = `http://127.0.0.1:${server.port}/api/reports`;
  try {
    await expect(
      sendReport(payload, new AbortController().signal, { url, timeoutMs: 100 }),
    ).rejects.toThrow();
    expect((await sendReport(payload, new AbortController().signal, { url })).status).toBe(204);
    expect(requests).toBe(2);
  } finally {
    await server.stop(true);
  }
});

test("closing a report can cancel its request before the deadline", async () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Promise<Response>(() => {}),
  });
  const controller = new AbortController();
  try {
    const request = sendReport(payload, controller.signal, {
      url: `http://127.0.0.1:${server.port}/api/reports`,
    });
    controller.abort();
    await expect(request).rejects.toThrow();
  } finally {
    await server.stop(true);
  }
});

test("the transport preserves report content and authentication/rate-limit statuses", async () => {
  const received: unknown[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      expect(request.method).toBe("POST");
      expect(request.headers.get("content-type")).toBe("application/json");
      received.push(await request.json());
      return new Response(null, { status: received.length === 1 ? 401 : 429 });
    },
  });
  try {
    for (const status of [401, 429])
      expect(
        (
          await sendReport(payload, new AbortController().signal, {
            url: `http://127.0.0.1:${server.port}/api/reports`,
          })
        ).status,
      ).toBe(status);
    expect(received).toEqual([payload, payload]);
  } finally {
    await server.stop(true);
  }
});
