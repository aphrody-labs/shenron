#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Real-browser proof (Google Chrome through Bun.WebView) of the three WASM/video surfaces:
 *
 *   bun scripts/ops/prove-browser.ts [koharu|dbxv2|player]... --media <authorized-real-video.mp4>
 *
 *   dbxv2   production https://dragonballfr.com/games/xenoverse-2: a synthetic #CUS file is handed to the page's
 *           file input; the page must load shenron_re from the CDN, parse 708 records and show them.
 *   koharu  the repository's koharu-canvas module served locally: init, WebGPU adapter, createCanvas, resize, clear.
 *   player  the Shenron player stack (@aphrody/bun-video/playback, as used by VideoPlayer) bundled and run in a
 *           <video> against an explicitly supplied real local MP4: native FilmCraft metadata must match
 *           the browser dimensions, and currentTime must advance. No synthetic clip is generated.
 *
 * Prints one JSON object per proof and exits 1 if any fails. Nothing is written to the site.
 */
import { join } from "node:path";

const root = join(import.meta.dir, "..", "..");
const argv = process.argv.slice(2);
const mediaIndex = argv.indexOf("--media");
const mediaPath = mediaIndex >= 0 ? argv[mediaIndex + 1] : process.env.SHENRON_VIDEO_PROOF_MEDIA;
const want = new Set(
  argv.filter((a, i) => !a.startsWith("-") && (mediaIndex < 0 || i !== mediaIndex + 1)),
);
const run = (name: string) => want.size === 0 || want.has(name);
const GPU_ARGS = [
  "--no-sandbox",
  "--enable-unsafe-webgpu",
  "--enable-features=Vulkan",
  "--use-angle=swiftshader",
  "--use-webgpu-adapter=swiftshader",
  "--ignore-gpu-blocklist",
];
const chrome = (browserArgs = GPU_ARGS) => ({ type: "chrome", url: false, argv: browserArgs });
const results: { proof: string; ok: boolean; detail: unknown }[] = [];
const record = (proof: string, ok: boolean, detail: unknown) => {
  results.push({ proof, ok, detail });
  console.log(JSON.stringify({ proof, ok, detail }));
};

if (run("dbxv2")) {
  await using view = new (Bun as any).WebView({ width: 1280, height: 900, backend: chrome() });
  await view.navigate("https://dragonballfr.com/games/xenoverse-2");
  const detail = await view.evaluate(`(async () => {
    const count = 708, header = 16, entry = 48;
    const bytes = new Uint8Array(header + count * entry), dv = new DataView(bytes.buffer);
    bytes.set([0x23, 0x43, 0x55, 0x53], 0);
    dv.setUint32(4, 1, true); dv.setUint32(8, count, true); dv.setUint32(12, header, true);
    for (let i = 0; i < count; i++) { const o = header + i * entry; dv.setUint32(o, 1000 + i, true); dv.setUint16(o + 4, i % 4, true); }
    const input = document.querySelector('input[type=file]');
    if (!input) return { error: "no file input" };
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], "synthetic.cus"));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (/708/.test(document.body.innerText)) break;
    }
    const wasm = performance.getEntriesByType("resource").filter(e => e.name.includes(".wasm")).map(e => ({ url: e.name, status: e.responseStatus, bytes: e.encodedBodySize }));
    return { wasm, shows708: /708/.test(document.body.innerText), text: document.body.innerText.split("\\n").filter(l => /708|cus|CUS/.test(l)).slice(0, 4) };
  })()`);
  const d = detail as { wasm?: { status: number }[]; shows708?: boolean };
  record(
    "dbxv2-wasm",
    !!d.shows708 && !!d.wasm?.length && d.wasm.every((w) => w.status === 200),
    detail,
  );
}

if (run("koharu")) {
  const dir = join(root, "packages", "koharu", "src", "wasm");
  using server = Bun.serve({
    port: 0,
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/") {
        return new Response(
          `<canvas id=c width=256 height=256></canvas><script type=module>
            import init, { createCanvas } from "/koharu_canvas.js";
            const out = { gpu: !!navigator.gpu };
            try {
              for (let i = 0; i < 5 && !out.adapter; i++) { out.adapter = !!(navigator.gpu && (await navigator.gpu.requestAdapter())); if (!out.adapter) await new Promise(r => setTimeout(r, 400)); }
              await init({ module_or_path: fetch("/koharu_canvas_bg.wasm") });
              out.init = true;
              if (out.adapter) {
                const canvas = await createCanvas(document.getElementById("c"));
                canvas.resize(256, 256, 1, new Uint8Array([26, 26, 26, 255]));
                canvas.clear();
                await canvas.render();
                out.sample = Array.from(await canvas.sampleColor(128, 128));
                out.canvas = true;
              }
            } catch (e) { out.error = String(e).slice(0, 300); }
            window.__result = out;
          </script>`,
          { headers: { "content-type": "text/html" } },
        );
      }
      const file = Bun.file(join(dir, path.slice(1)));
      if (!(await file.exists()) || path.includes("..")) return new Response(null, { status: 404 });
      return new Response(file, {
        headers: {
          "content-type": path.endsWith(".wasm") ? "application/wasm" : "text/javascript",
        },
      });
    },
  });
  // The first Chrome of a process sometimes starts without a WebGPU adapter: retry with a fresh view.
  let detail: any;
  for (let attempt = 0; attempt < 4 && !detail?.adapter; attempt++) {
    await using view = new (Bun as any).WebView({
      width: 400,
      height: 400,
      backend: chrome(GPU_ARGS),
    });
    await view.navigate(`http://localhost:${server.port}/`);
    detail = undefined;
    for (let i = 0; i < 60 && !detail; i++) {
      await Bun.sleep(500);
      detail = await view.evaluate("window.__result ?? null");
    }
  }
  record(
    "koharu-wasm",
    !!detail?.adapter &&
      !!detail?.init &&
      !detail?.error &&
      detail.sample?.[0] === 26 &&
      detail.sample?.[3] === 255,
    {
      ...detail,
      note: detail?.adapter
        ? "WebGPU canvas created, rendered and read back"
        : "no WebGPU adapter after 4 attempts: canvas not created",
    },
  );
}

if (run("player")) {
  if (!mediaPath || !(await Bun.file(mediaPath).exists()))
    throw new Error("Player proof requires --media <authorized real local MP4>");
  if (!(Bun as any).Video?.available)
    throw new Error("Player proof requires the native Bun Video / FilmCraft provider");
  const clip = mediaPath;
  const metadata = await new (Bun as any).Video(clip).metadata();
  if (!(metadata.width > 0 && metadata.height > 0 && metadata.duration > 2))
    throw new Error("Real video metadata must establish dimensions and at least two seconds");
  const bundle = await Bun.build({
    entrypoints: [join(import.meta.dir, "prove-browser-player.ts")],
    root,
    target: "browser",
  });
  if (!bundle.success) throw new Error(bundle.logs.join("\n"));
  const script = await bundle.outputs[0]!.text();
  using server = Bun.serve({
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/")
        return new Response(
          `<video id=v muted playsinline></video><script type=module src=/player.js></script>`,
          {
            headers: { "content-type": "text/html" },
          },
        );
      if (path === "/player.js")
        return new Response(script, { headers: { "content-type": "text/javascript" } });
      if (path === "/clip.mp4")
        return new Response(Bun.file(clip), { headers: { "content-type": "video/mp4" } });
      return new Response(null, { status: 404 });
    },
  });
  await using view = new (Bun as any).WebView({ width: 640, height: 360, backend: chrome() });
  await view.navigate(`http://localhost:${server.port}/`);
  let detail: any;
  for (let i = 0; i < 40; i++) {
    await Bun.sleep(500);
    detail = await view.evaluate("window.__result ?? null");
    if (detail?.done) break;
  }
  record(
    "player-video",
    !!detail?.done &&
      detail.ready >= 3 &&
      detail.width === metadata.width &&
      detail.height === metadata.height &&
      detail.advanced &&
      !detail.error,
    {
      ...detail,
      native: {
        decoder: (Bun as any).Video.decoder,
        width: metadata.width,
        height: metadata.height,
      },
    },
  );
}

process.exit(results.every((r) => r.ok) ? 0 : 1);
