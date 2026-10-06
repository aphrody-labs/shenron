// SPDX-License-Identifier: Apache-2.0
// The front relay forwards the socket peer as the client address (never a caller header), and
// the desktop profile makes the loopback the staff workstation of the site.
import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnvironment } from "../src/config";
import { serveFront } from "../src/front";
import { testPaths } from "./support";

const upstream = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch: (request) =>
    Response.json({
      realIp: request.headers.get("x-real-ip"),
      forwardedFor: request.headers.get("x-forwarded-for"),
    }),
});
const dir = mkdtempSync(join(tmpdir(), "shenron-relay-"));
mkdirSync(join(dir, ".next", "static"), { recursive: true });
mkdirSync(join(dir, "public"), { recursive: true });
writeFileSync(join(dir, "public", "x.txt"), "x");
mkdirSync(join(dir, ".next", "static", "media"), { recursive: true });
writeFileSync(join(dir, ".next", "static", "media", "koharu_canvas_bg.wasm"), "\0asm");
const front = serveFront({
  hostname: "127.0.0.1",
  port: 0,
  layout: { dist: join(dir, ".next"), publicDir: join(dir, "public") } as never,
  local: async () => null,
  host: null,
  nextPort: upstream.port ?? 0,
  ready: () => true,
});
afterAll(() => {
  void front.stop(true);
  void upstream.stop(true);
});

test("a caller-supplied address never reaches the site; the socket peer does", async () => {
  const response = await fetch(`http://127.0.0.1:${front.port}/page`, {
    headers: { "x-real-ip": "203.0.113.9", "x-forwarded-for": "203.0.113.9" },
  });
  expect(await response.json()).toEqual({ realIp: "127.0.0.1", forwardedFor: null });
});

test("only the desktop profile lists the loopback as an administration address", () => {
  const paths = testPaths(dir);
  const desktop: NodeJS.ProcessEnv = { SHENRON_PROFILE: "desktop" };
  loadEnvironment(paths, desktop);
  expect(desktop.SHENRON_ADMIN_IPS).toBe("127.0.0.1,::1");
  const pub: NodeJS.ProcessEnv = { SHENRON_PROFILE: "public" };
  loadEnvironment(paths, pub);
  expect(pub.SHENRON_ADMIN_IPS).toBeUndefined();
});

test("the editor canvas WebAssembly is served locally as application/wasm", async () => {
  const response = await fetch(
    `http://127.0.0.1:${front.port}/_next/static/media/koharu_canvas_bg.wasm`,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/wasm");
});
