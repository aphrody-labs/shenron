// SPDX-License-Identifier: Apache-2.0
import { createElement } from "react";
import { $ } from "bun";
import { renderToStaticMarkup } from "react-dom/server";
import { ShenronComposition } from "../../packages/ui/src/video/ShenronComposition";
import type { VideoPlan } from "../../packages/media/src/video-plan";
import { collectVideoPlan, readVideoRequest } from "./plan";

interface BrowserView {
  resize(width: number, height: number): Promise<void>;
  navigate(url: string): Promise<unknown>;
  evaluate<T>(expression: string): Promise<T>;
  screenshot(options: { format: "png"; encoding: "buffer" }): Promise<Uint8Array>;
  close(): void;
}
interface CapturedFrame {
  frame: number;
  png: Uint8Array;
}
type Capture = (
  context: {
    navigate(url: string): Promise<unknown>;
    evaluate<T>(expression: string): Promise<T>;
    screenshot(): Promise<Uint8Array>;
  },
  options: {
    url: string;
    fps: { num: number; den: number };
    startFrame: number;
    endFrame: number;
    signal: AbortSignal;
  },
) => AsyncGenerator<CapturedFrame>;
export function pngDimensions(bytes: Uint8Array) {
  if (
    bytes.length < 24 ||
    ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
  )
    throw new Error("Capture is not a PNG");
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: data.getUint32(16), height: data.getUint32(20) };
}
function ownerPath(name: string) {
  const value = process.env[name];
  if (!value || !/^(?:\/|[A-Za-z]:[\\/])/.test(value) || value.includes("\0"))
    throw new Error(`${name} must be an owner-configured absolute path`);
  return value.replace(/\\/g, "/").replace(/\/$/, "");
}
function html(plan: VideoPlan, frame: number) {
  return renderToStaticMarkup(createElement(ShenronComposition, { plan, frame }));
}
async function closeOwnedBrowser(endpoint: string | undefined) {
  if (!endpoint) return;
  await new Promise<void>((resolve) => {
    const socket = new WebSocket(endpoint);
    const finish = () => {
      clearTimeout(timer);
      socket.close();
      resolve();
    };
    const timer = setTimeout(finish, 1000);
    socket.addEventListener(
      "open",
      () => socket.send(JSON.stringify({ id: 1, method: "Browser.close" })),
      { once: true },
    );
    socket.addEventListener("message", finish, { once: true });
    socket.addEventListener("error", finish, { once: true });
    socket.addEventListener("close", finish, { once: true });
  });
}
export function validateNativeRenderBounds(input: {
  width: number;
  height: number;
  fps: number;
  frames: number;
  durationSeconds: number;
}) {
  const { width, height, fps, frames, durationSeconds } = input;
  if (
    ![width, height, fps, frames].every(Number.isSafeInteger) ||
    width < 16 ||
    height < 16 ||
    width > 1920 ||
    height > 1920 ||
    width % 2 !== 0 ||
    height % 2 !== 0 ||
    width * height > 2_073_600 ||
    fps < 1 ||
    fps > 60 ||
    frames < 1 ||
    frames > 1800 ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    Math.abs(frames / fps - durationSeconds) > Number.EPSILON
  )
    throw new Error("Render plan exceeds the native encoder dimensions, timing or frame budget");
}
export async function renderVideo(plan: VideoPlan) {
  validateNativeRenderBounds({
    width: plan.request.width,
    height: plan.request.height,
    fps: plan.request.fps,
    frames: plan.render.endFrame,
    durationSeconds: plan.request.durationSeconds,
  });
  const home = ownerPath("SHENRON_VIDEO_OUTPUT_HOME");
  const rendererHome = ownerPath("SHENRON_VIDEO_RENDERER_HOME");
  const chrome = ownerPath("SHENRON_VIDEO_CHROME");
  const nativeEncoder = ownerPath("SHENRON_VIDEO_ENCODER");
  for (const path of [chrome, nativeEncoder])
    if (!(await Bun.file(path).exists()))
      throw new Error("Configured backend executable is absent");
  const capturePath = `${rendererHome}/hyperframes/packages/engine/src/services/nativeWebViewCapture.ts`;
  const capture = (await import(capturePath)).captureNativeWebViewFrames as Capture;
  if (typeof capture !== "function") throw new Error("Owner capture API is absent");
  const WebView = (Bun as unknown as { WebView?: new (options: unknown) => BrowserView }).WebView;
  if (!WebView) throw new Error("Runtime does not expose Bun.WebView");
  const id = crypto.randomUUID();
  const dir = `${home}/${id}`;
  if (!(Bun as any).Video?.available || !(Bun as any).Image?.available)
    throw new Error("Bun Video / FilmCraft and Bun.Image providers are required");
  const archive = `${dir}/frames`;
  const web = `${dir}/web.mp4`;
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error("Rendering exceeded 280 seconds")),
    280000,
  );
  const interrupt = () => controller.abort(new Error("Rendering interrupted"));
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === `/${nonce}/frame`) {
        const frame = Number(url.searchParams.get("n"));
        if (!Number.isSafeInteger(frame) || frame < 0 || frame >= plan.render.endFrame)
          return new Response("", { status: 400 });
        return new Response(html(plan, frame), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
      if (url.pathname !== `/${nonce}/`) return new Response("", { status: 404 });
      const script = `window.__hf={duration:${plan.request.durationSeconds},seek:async(t)=>{const n=Math.min(${plan.render.endFrame - 1},Math.floor(t*${plan.request.fps}+1e-7));const r=await fetch('./frame?n='+n);if(!r.ok)throw Error('Frame unavailable');document.getElementById('frame').innerHTML=await r.text();await document.fonts.ready;}};`;
      return new Response(
        `<!doctype html><html lang="${plan.request.language}"><head><style>html,body{margin:0;padding:0;overflow:hidden}</style></head><body><div id="frame">${html(plan, 0)}</div><script nonce="${nonce}">${script}</script></body></html>`,
        {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'none'; font-src 'none'; frame-src 'none'`,
          },
        },
      );
    },
  });
  let view: BrowserView | undefined;
  let browserEndpoint: string | undefined;
  const children = new Set<Bun.Subprocess>();
  const lock = `${home}/.shenron-render-lock`;
  let ownsLock = false;
  const terminate = (child: Bun.Subprocess) => {
    if (process.platform !== "win32") {
      try {
        process.kill(-child.pid, "SIGKILL");
        return;
      } catch {
        /* The owned process group may already have exited. */
      }
    }
    try {
      child.kill("SIGKILL");
    } catch {
      /* Reaped children require no further termination. */
    }
  };
  let shutdownPromise: Promise<void> | undefined;
  const shutdown = () =>
    (shutdownPromise ??= (async () => {
      await closeOwnedBrowser(browserEndpoint);
      try {
        view?.close();
      } catch {
        /* A disconnected browser is already closed. */
      }
      for (const child of children) terminate(child);
    })());
  const abort = () => {
    void shutdown();
  };
  controller.signal.addEventListener("abort", abort, { once: true });
  try {
    const acquired = await $`mkdir ${lock}`.quiet().nothrow();
    if (acquired.exitCode !== 0)
      throw new Error("Video renderer is busy or output home is unavailable");
    ownsLock = true;
    await Bun.write(`${dir}/plan.json`, JSON.stringify(plan), { mode: 0o600 });
    await Bun.write(`${dir}/chrome/.shenron-owned`, id);
    const browser = Bun.spawn(
      [
        chrome,
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--remote-debugging-address=127.0.0.1",
        "--remote-debugging-port=0",
        `--user-data-dir=${dir}/chrome`,
        "about:blank",
      ],
      { detached: true, stdout: "ignore", stderr: Bun.file(`${dir}/chrome.log`) },
    );
    children.add(browser);
    const launchDeadline = Date.now() + 20000;
    let port = 0;
    while (port < 1 || port > 65535 || !Number.isSafeInteger(port)) {
      controller.signal.throwIfAborted();
      if (browser.exitCode !== null || Date.now() > launchDeadline)
        throw new Error("Owned Chrome did not start");
      await Bun.sleep(50);
      const fresh = Bun.file(`${dir}/chrome/DevToolsActivePort`);
      if (await fresh.exists()) port = Number((await fresh.text()).split("\n")[0]);
    }
    if (!Number.isSafeInteger(port) || port < 1 || port > 65535)
      throw new Error("Invalid owned Chrome port");
    const browserPath = (await Bun.file(`${dir}/chrome/DevToolsActivePort`).text()).split("\n")[1];
    if (!browserPath?.startsWith("/devtools/browser/"))
      throw new Error("Invalid owned Chrome browser endpoint");
    browserEndpoint = `ws://127.0.0.1:${port}${browserPath}`;
    const pages = (await fetch(`http://127.0.0.1:${port}/json/list`, {
      signal: controller.signal,
    }).then((response) => response.json())) as { type: string; webSocketDebuggerUrl?: string }[];
    const endpoint = pages.find((page) => page.type === "page")?.webSocketDebuggerUrl;
    if (
      !endpoint ||
      new URL(endpoint).hostname !== "127.0.0.1" ||
      Number(new URL(endpoint).port) !== port
    )
      throw new Error("Owned Chrome page endpoint is absent");
    view = new WebView({
      width: plan.request.width,
      height: plan.request.height,
      backend: { type: "chrome", url: endpoint },
    });
    await view.navigate(`http://127.0.0.1:${server.port}/${nonce}/`);
    await view.resize(plan.request.width, plan.request.height);
    const encoder = Bun.spawn(
      [
        nativeEncoder,
        "encode-rgba",
        "--width",
        String(plan.request.width),
        "--height",
        String(plan.request.height),
        "--fps-num",
        String(plan.request.fps),
        "--fps-den",
        "1",
        "--frames",
        String(plan.render.endFrame),
        "--crf",
        "18",
      ],
      {
        detached: true,
        stdin: "pipe",
        stdout: Bun.file(web),
        stderr: Bun.file(`${dir}/encoder.log`),
        env: { ...process.env, RAYON_NUM_THREADS: "1" },
      },
    );
    children.add(encoder);
    const representative = new Set([
      0,
      Math.floor(plan.render.endFrame / 2),
      plan.render.endFrame - 1,
    ]);
    const frames: { frame: number; path: string; sha256: string }[] = [];
    const originals: { frame: number; path: string; sha256: string }[] = [];
    let originalBytes = 0;
    let count = 0;
    const context = {
      navigate: (url: string) => view!.navigate(url),
      evaluate: <T>(expression: string) => view!.evaluate<T>(expression),
      screenshot: () => view!.screenshot({ format: "png", encoding: "buffer" }),
    };
    for await (const captured of capture(context, {
      url: `http://127.0.0.1:${server.port}/${nonce}/`,
      fps: plan.render.fps,
      startFrame: 0,
      endFrame: plan.render.endFrame,
      signal: controller.signal,
    })) {
      const dimensions = pngDimensions(captured.png);
      if (
        dimensions.width !== plan.request.width ||
        dimensions.height !== plan.request.height ||
        captured.frame !== count
      )
        throw new Error(
          `Capture ${dimensions.width}x${dimensions.height} frame ${captured.frame}; expected ${plan.request.width}x${plan.request.height} frame ${count}`,
        );
      const path = `${archive}/${String(count).padStart(5, "0")}.png`;
      originalBytes += captured.png.byteLength;
      if (originalBytes > 2 * 1024 ** 3)
        throw new Error("Original PNG archive exceeds the 2 GiB job budget");
      await Bun.write(path, captured.png, { mode: 0o600 });
      const sha256 = new Bun.CryptoHasher("sha256").update(captured.png).digest("hex");
      const stored = await Bun.file(path).bytes();
      if (new Bun.CryptoHasher("sha256").update(stored).digest("hex") !== sha256)
        throw new Error("Original PNG archive differs from browser capture");
      const original = { frame: count, path, sha256 };
      originals.push(original);
      if (representative.has(count)) frames.push(original);
      const rgba = await new (Bun as any).Image(captured.png).rgba();
      if (rgba.width !== plan.request.width || rgba.height !== plan.request.height)
        throw new Error("Bun.Image RGBA dimensions differ from captured PNG");
      encoder.stdin.write(rgba.data);
      await encoder.stdin.flush();
      count++;
    }
    encoder.stdin.end();
    if ((await encoder.exited) !== 0 || count !== plan.render.endFrame)
      throw new Error("FilmCraft web encoding or frame count failed");
    children.delete(encoder);
    const webProbe = await new (Bun as any).Video(web).metadata();
    if (
      webProbe.width !== plan.request.width ||
      webProbe.height !== plan.request.height ||
      webProbe.frameCount !== count ||
      webProbe.fpsNumerator !== plan.request.fps ||
      webProbe.fpsDenominator !== 1 ||
      !/^H\.264(?:\s|$)/.test(String(webProbe.codec)) ||
      Math.abs(webProbe.duration - plan.request.durationSeconds) > 1 / plan.request.fps
    )
      throw new Error("FilmCraft encoded media differs from plan");
    const archiveIndex = archive + "/index.json";
    await Bun.write(
      archiveIndex,
      JSON.stringify({ format: "png-sequence", fps: plan.render.fps, frames: originals }),
      { mode: 0o600 },
    );
    const digest = async (path: string) =>
      new Bun.CryptoHasher("sha256").update(await Bun.file(path).arrayBuffer()).digest("hex");
    const receipt = {
      schema: "shenron.video.render/v2",
      plan: {
        ...plan,
        qualification: { ...plan.qualification, rendered: true, pixelMatchVerified: false },
      },
      artifact: {
        archive: {
          format: "png-sequence",
          path: archive,
          index: archiveIndex,
          sha256: await digest(archiveIndex),
          frames: count,
          bytes: originalBytes,
        },
        web: { path: web, sha256: await digest(web), probe: webProbe },
        frames,
      },
      qualification: {
        backend:
          "bun.WebView/chrome + bun-video captureNativeWebViewFrames + shenron-video/FilmCraft",
        ownerCapturePath: capturePath,
        originalPngFramesVerified: true,
        comparison:
          "All original captured PNGs retained byte-exact; H.264 web derivative is lossy BT.709 YUV420; no external anime reference",
        browserRuntimeQualified: false,
        nativeEncodeVideoQualified: true,
        workers: 1,
      },
      finishedAt: new Date().toISOString(),
    };
    await Bun.write(`${dir}/receipt.json`, JSON.stringify(receipt, null, 2), { mode: 0o600 });
    return receipt;
  } finally {
    clearTimeout(timeout);
    controller.signal.removeEventListener("abort", abort);
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
    await shutdown();
    for (const child of children) {
      terminate(child);
      await child.exited.catch(() => {});
    }
    try {
      view?.close();
    } catch {
      /* An aborted browser may already be disconnected. */
    }
    await server.stop(true);
    if (ownsLock) await $`rm -r ${lock}`.quiet();
  }
}
if (import.meta.main) {
  if (process.platform !== "win32") process.umask(0o077);
  try {
    console.log(
      JSON.stringify(await renderVideo(await collectVideoPlan(await readVideoRequest()))),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Video rendering failed");
    process.exitCode = 1;
  }
}
