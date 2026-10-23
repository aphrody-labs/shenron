import "./setup"; // must be first
import { createCanvas } from "@napi-rs/canvas";
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { clearRemoteImageCache, loadRemoteImage } from "~/lib/canvas-kit";
import { canvasNativeOk } from "./render-helpers";

const d = canvasNativeOk ? describe : describe.skip;

/** Local image server counting the requests of each path. */
const hits = new Map<string, number>();
let png: Buffer;
const server = Bun.serve({
  port: 0,
  fetch(request) {
    const path = new URL(request.url).pathname;
    hits.set(path, (hits.get(path) ?? 0) + 1);
    if (path === "/avatar.png")
      return new Response(new Uint8Array(png), { headers: { "content-type": "image/png" } });
    if (path === "/huge.png") return new Response(new Uint8Array(5 * 1024 * 1024));
    if (path === "/garbage.png") return new Response("not an image");
    return new Response("gone", { status: 404 });
  },
});
afterAll(() => server.stop(true));

const url = (path: string) => `http://127.0.0.1:${server.port}${path}`;

beforeEach(() => {
  hits.clear();
  clearRemoteImageCache();
  const canvas = createCanvas(8, 8);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#e78220";
  ctx.fillRect(0, 0, 8, 8);
  png = canvas.toBuffer("image/png");
});

d("loadRemoteImage", () => {
  test("decodes an avatar once and serves the cache afterwards", async () => {
    const first = await loadRemoteImage(url("/avatar.png"));
    const second = await loadRemoteImage(url("/avatar.png"));
    expect(first?.width).toBe(8);
    expect(second).toBe(first);
    expect(hits.get("/avatar.png")).toBe(1);
  });

  test("concurrent requests of one URL share one download", async () => {
    const all = await Promise.all(
      Array.from({ length: 5 }, () => loadRemoteImage(url("/avatar.png"))),
    );
    expect(new Set(all).size).toBe(1);
    expect(hits.get("/avatar.png")).toBe(1);
  });

  test("a failing URL resolves null and is not asked again for a while", async () => {
    expect(await loadRemoteImage(url("/missing.png"))).toBeNull();
    expect(await loadRemoteImage(url("/missing.png"))).toBeNull();
    expect(await loadRemoteImage(url("/missing.png"))).toBeNull();
    expect(hits.get("/missing.png")).toBe(1);
  });

  test("a corrupt or oversized body is refused", async () => {
    expect(await loadRemoteImage(url("/garbage.png"))).toBeNull();
    expect(await loadRemoteImage(url("/huge.png"))).toBeNull();
  });

  test("an unreachable host resolves null", async () => {
    expect(await loadRemoteImage("http://127.0.0.1:1/avatar.png")).toBeNull();
  });
});
