// SPDX-License-Identifier: Apache-2.0
/** HTTP surface: security headers (no X-Frame-Options, CSP for the Discord iframe), static files, health. */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FRAME_ANCESTORS, contentSecurityPolicy, securityHeaders } from "../src/http/security";
import { isImmutableName, safeAssetPath } from "../src/http/assets";
import type { RunningActivityServer } from "../src/server";
import { startTestServer, testConfig } from "./support";

let dist: string;
let outside: string;
let server: RunningActivityServer;

beforeAll(() => {
  dist = mkdtempSync(join(tmpdir(), "activity-dist-"));
  writeFileSync(join(dist, "index.html"), "<!doctype html><title>Arène</title>");
  writeFileSync(join(dist, "main-3f9a1c2b.js"), "console.log(1);\n".repeat(200));
  writeFileSync(join(dist, "styles-9d8e7f6a.css"), "body{margin:0}\n".repeat(100));
  mkdirSync(join(dist, "fonts"));
  writeFileSync(join(dist, "fonts", "text-0a1b2c3d4e.woff2"), "wOF2");
  // A file next to the web root, which no request may reach.
  outside = `activity-outside-${crypto.randomUUID()}.txt`;
  writeFileSync(join(dist, "..", outside), "outside the web root");
  server = startTestServer({
    config: testConfig({
      SHENRON_ACTIVITY_DIST: dist,
      SHENRON_ACTIVITY_PUBLIC_URL: "https://activity.dragonballfr.com",
    }),
  });
});

afterAll(async () => {
  await server.stop();
  rmSync(dist, { recursive: true, force: true });
  rmSync(join(tmpdir(), outside), { force: true });
});

const get = (path: string, init?: RequestInit) => fetch(`${server.url}${path}`, init);

/** Every kind of response the host produces. */
const SAMPLES: Array<[string, () => Promise<Response>]> = [
  ["the page", () => get("/")],
  ["the page by name", () => get("/index.html")],
  ["a script", () => get("/main-3f9a1c2b.js")],
  ["a stylesheet", () => get("/styles-9d8e7f6a.css")],
  ["a font", () => get("/fonts/text-0a1b2c3d4e.woff2")],
  ["a missing file", () => get("/nope.js")],
  ["health", () => get("/health")],
  ["the token route, wrong method", () => get("/api/token")],
  ["the token route, bad body", () => get("/api/token", { method: "POST", body: "{" })],
  ["a socket route without upgrade", () => get("/ws")],
  ["a wrong method on a file", () => get("/", { method: "DELETE" })],
];

describe("response headers", () => {
  for (const [label, request] of SAMPLES) {
    test(`${label}: no X-Frame-Options, a CSP that lets Discord frame it`, async () => {
      const response = await request();
      expect(response.headers.has("x-frame-options")).toBe(false);
      const csp = response.headers.get("content-security-policy") ?? "";
      expect(csp).toContain("frame-ancestors https://discord.com");
      expect(csp).toContain("https://*.discordsays.com");
      expect(csp).not.toContain("'self' https://*.discordsays.com;"); // frame-ancestors, not default-src
      expect(csp).toContain("default-src 'self'");
      expect(csp).not.toContain("'unsafe-eval'");
      expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    });
  }

  test("the CSP names the Activity socket and the Discord CDN for avatars", () => {
    const csp = contentSecurityPolicy({ publicUrl: "https://activity.dragonballfr.com" });
    expect(csp).toContain("connect-src 'self' https://discord.com wss://*.discordsays.com");
    expect(csp).toContain("wss://activity.dragonballfr.com");
    expect(csp).toContain("img-src 'self' data: https://cdn.discordapp.com");
    expect(csp).not.toContain("ws://localhost");
    expect(contentSecurityPolicy({ development: true })).toContain("ws://localhost:*");
  });

  test("frame-ancestors lists only Discord origins", () => {
    for (const origin of FRAME_ANCESTORS) expect(origin).toMatch(/^https:\/\/(\*\.)?discord/);
    expect(securityHeaders()).not.toHaveProperty("X-Frame-Options");
  });
});

describe("static files", () => {
  test("the page is never cached; hashed files are immutable", async () => {
    const page = await get("/");
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(page.headers.get("cache-control")).toBe("no-store");
    expect(await page.text()).toContain("Arène");

    const script = await get("/main-3f9a1c2b.js");
    expect(script.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(script.headers.get("content-type")).toContain("text/javascript");
    const font = await get("/fonts/text-0a1b2c3d4e.woff2");
    expect(font.headers.get("content-type")).toBe("font/woff2");
  });

  test("text files are gzipped when the client accepts it", async () => {
    const response = await get("/main-3f9a1c2b.js", { headers: { "Accept-Encoding": "gzip" } });
    expect(response.headers.get("content-encoding")).toBe("gzip");
    expect(await response.text()).toContain("console.log(1);");
    const plain = await get("/main-3f9a1c2b.js", { headers: { "Accept-Encoding": "identity" } });
    expect(plain.headers.get("content-encoding")).toBeNull();
  });

  test("HEAD has headers and no body", async () => {
    const response = await get("/", { method: "HEAD" });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });

  test("traversal and odd paths are refused", async () => {
    for (const path of [
      `/..%2F${outside}`,
      `/fonts/..%2F..%2F${outside}`,
      `/fonts/..%5C..%5C${outside}`,
      `/%2e%2e/${outside}`,
      "/a%00b",
    ]) {
      const response = await get(path);
      expect([400, 404]).toContain(response.status);
      expect(await response.text()).not.toContain("outside the web root");
    }
    expect(safeAssetPath("/../secret.txt")).toBeNull();
    expect(safeAssetPath("/a/../b")).toBeNull();
    expect(safeAssetPath("/a\\b")).toBeNull();
    expect(safeAssetPath("/C:/windows/win.ini")).toBeNull();
    expect(safeAssetPath("/")).toBe("index.html");
    expect(safeAssetPath("/fonts/x-0a1b2c3d4e.woff2")).toBe("fonts/x-0a1b2c3d4e.woff2");
  });

  test("a missing file is a 404, never the page", async () => {
    const response = await get("/does-not-exist");
    expect(response.status).toBe(404);
  });

  test("only hashed names are immutable", () => {
    expect(isImmutableName("index.html")).toBe(false);
    expect(isImmutableName("main-3f9a1c2b.js")).toBe(true);
    expect(isImmutableName("chunk-pq9x2m7k.css")).toBe(true);
    expect(isImmutableName("main.js")).toBe(false);
  });
});

describe("health", () => {
  test("reports what is available", async () => {
    const response = await get("/health");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      status: "ok",
      client: true,
      oauth: true,
      settlement: true,
      rooms: 0,
      sockets: 0,
    });
    expect(await (await get("/api/health")).json()).toMatchObject({ status: "ok" });
  });

  test("a server without a built client or secrets is degraded, not down", async () => {
    const empty = mkdtempSync(join(tmpdir(), "activity-empty-"));
    const bare = startTestServer({
      config: testConfig({ SHENRON_ACTIVITY_DIST: empty, DISCORD_CLIENT_SECRET: "" }),
    });
    try {
      const body = (await (await fetch(`${bare.url}/health`)).json()) as Record<string, unknown>;
      expect(body).toMatchObject({ status: "degraded", client: false, oauth: false });
      const page = await fetch(`${bare.url}/`);
      expect(page.status).toBe(503);
      expect(page.headers.has("x-frame-options")).toBe(false);
    } finally {
      await bare.stop();
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
