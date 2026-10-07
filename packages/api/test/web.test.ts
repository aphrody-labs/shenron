// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { createShenronApi, type WebPort, type ShenronApiPorts } from "../src/server";
import { createMemoryRateLimiter, createPublicCache, noopInvalidation } from "../src/http";
import { WEB_PATHS } from "../src/contract";

function api(web: WebPort) {
  const ports: ShenronApiPorts = {
    web,
    auth: {
      owner: async () => null,
      admin: async (incoming) => incoming.headers.get("authorization") === "Bearer test-owner",
    },
    rateLimit: createMemoryRateLimiter(),
    publicCache: createPublicCache(),
    invalidation: noopInvalidation,
    cors: { allowedOrigins: [] },
    clientIp: () => "test",
    isDirectLoopback: () => false,
  };
  return createShenronApi(ports, { service: "shenron-server" });
}
const status = async () => ({ version: "aphrody 0.3.0", capabilities: [] });
function request(path: string, body?: unknown, authorized = true) {
  return new Request(`http://localhost${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(authorized ? { authorization: "Bearer test-owner" } : {}),
      "content-type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test("Web authority precedes validation and native execution", async () => {
  let calls = 0;
  const owner = api({
    status,
    mediaResolve: async () => {
      calls++;
      return { host: "test" };
    },
  });
  expect(
    (await owner.fetch(request(WEB_PATHS.mediaResolve, { url: "invalid" }, false))).status,
  ).toBe(403);
  expect(
    (await owner.fetch(request(WEB_PATHS.mediaResolve, { url: "file:///private" }))).status,
  ).toBe(400);
  expect(
    (await owner.fetch(request(WEB_PATHS.framesVector, { path: "/private", args: ["exec"] })))
      .status,
  ).toBe(400);
  expect(calls).toBe(0);
});

test("Web forwards only the validated operation and cancellation signal", async () => {
  const received: unknown[] = [];
  const owner = api({
    status,
    mediaResolve: async (input, signal) => {
      received.push(input, signal);
      return { host: "test", hlsUrl: "https://media.test/video.m3u8" };
    },
  });
  const response = await owner.fetch(
    request(WEB_PATHS.mediaResolve, { url: "https://media.test/embed", args: ["exec"] }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(received[0]).toEqual({ url: "https://media.test/embed" });
  expect(received[1]).toBeInstanceOf(AbortSignal);
});

test("Missing or malformed native receipts return redacted unavailability", async () => {
  const owner = api({
    status,
    framesStats: async () => {
      throw new Error("secret native path");
    },
  });
  for (const path of [WEB_PATHS.framesStats, WEB_PATHS.framesVector]) {
    const response = await owner.fetch(
      request(path, path === WEB_PATHS.framesVector ? { imageBase64: "dGVzdA==" } : undefined),
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret");
  }
  const malformed = api({ status: async () => ({ version: "", capabilities: [] }) });
  expect((await malformed.fetch(request(WEB_PATHS.status))).status).toBe(503);
});
