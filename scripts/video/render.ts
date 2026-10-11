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
export async function renderVideo(plan: VideoPlan) {
  const home = ownerPath("SHENRON_VIDEO_OUTPUT_HOME");
  const rendererHome = ownerPath("SHENRON_VIDEO_RENDERER_HOME");
  const chrome = ownerPath("SHENRON_VIDEO_CHROME");
  const ffmpeg = ownerPath("SHENRON_VIDEO_FFMPEG");
  const ffprobe = ownerPath("SHENRON_VIDEO_FFPROBE");
  for (const path of [chrome, ffmpeg, ffprobe])
    if (!(await Bun.file(path).exists()))
      throw new Error("Configured backend executable is absent");
  const capturePath = `${rendererHome}/hyperframes/packages/engine/src/services/nativeWebViewCapture.ts`;
  const capture = (await import(capturePath)).captureNativeWebViewFrames as Capture;
  if (typeof capture !== "function") throw new Error("Owner capture API is absent");
  const WebView = (Bun as unknown as { WebView?: new (options: unknown) => BrowserView }).WebView;
  if (!WebView) throw new Error("Runtime does not expose Bun.WebView");
  const id = crypto.randomUUID();
  const dir = `${home}/${id}`;
  const master = `${dir}/master.mkv`;
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
  const run = async (args: string[]) => {
    controller.signal.throwIfAborted();
    const child = Bun.spawn(args, {
      detached: true,
      stdout: "pipe",
      stderr: Bun.file(`${dir}/process-${children.size}-${crypto.randomUUID()}.log`),
    });
    children.add(child);
    try {
      const output = await new Response(child.stdout).text();
      const code = await child.exited;
      if (code !== 0) throw new Error(`Media process failed with exit ${code}`);
      return output;
    } finally {
      children.delete(child);
    }
  };
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
        ffmpeg,
        "-nostdin",
        "-n",
        "-hide_banner",
        "-loglevel",
        "error",
        "-threads",
        "2",
        "-f",
        "image2pipe",
        "-framerate",
        String(plan.request.fps),
        "-vcodec",
        "png",
        "-i",
        "pipe:0",
        "-an",
        "-c:v",
        "ffv1",
        "-threads",
        "2",
        "-level",
        "3",
        "-pix_fmt",
        "bgra",
        master,
      ],
      { detached: true, stdin: "pipe", stdout: "ignore", stderr: Bun.file(`${dir}/master.log`) },
    );
    children.add(encoder);
    const representative = new Set([
      0,
      Math.floor(plan.render.endFrame / 2),
      plan.render.endFrame - 1,
    ]);
    const frames: { frame: number; path: string; sha256: string }[] = [];
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
      if (representative.has(count)) {
        const path = `${dir}/frame-${count}.png`;
        await Bun.write(path, captured.png, { mode: 0o600 });
        frames.push({
          frame: count,
          path,
          sha256: new Bun.CryptoHasher("sha256").update(captured.png).digest("hex"),
        });
      }
      encoder.stdin.write(captured.png);
      await encoder.stdin.flush();
      count++;
    }
    encoder.stdin.end();
    if ((await encoder.exited) !== 0 || count !== plan.render.endFrame)
      throw new Error("Archive encoding or frame count failed");
    children.delete(encoder);
    await run([
      ffmpeg,
      "-nostdin",
      "-n",
      "-hide_banner",
      "-loglevel",
      "error",
      "-threads",
      "2",
      "-i",
      master,
      "-an",
      "-c:v",
      "libx264",
      "-threads",
      "2",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      web,
    ]);
    const probe = async (path: string) =>
      JSON.parse(
        await run([
          ffprobe,
          "-v",
          "error",
          "-count_frames",
          "-select_streams",
          "v:0",
          "-show_entries",
          "stream=codec_name,width,height,nb_read_frames,avg_frame_rate:format=duration",
          "-of",
          "json",
          path,
        ]),
      ) as {
        streams: {
          codec_name: string;
          width: number;
          height: number;
          nb_read_frames: string;
          avg_frame_rate: string;
        }[];
        format: { duration: string };
      };
    const archiveProbe = await probe(master);
    const webProbe = await probe(web);
    for (const result of [archiveProbe, webProbe]) {
      const stream = result.streams[0];
      if (
        !stream ||
        stream.width !== plan.request.width ||
        stream.height !== plan.request.height ||
        Number(stream.nb_read_frames) !== count ||
        stream.avg_frame_rate !== `${plan.request.fps}/1` ||
        Math.abs(Number(result.format.duration) - plan.request.durationSeconds) >
          1 / plan.request.fps
      )
        throw new Error("Encoded media differs from plan");
    }
    if (
      archiveProbe.streams[0]!.codec_name !== "ffv1" ||
      webProbe.streams[0]!.codec_name !== "h264"
    )
      throw new Error("Unexpected codec");
    for (const frame of frames) {
      const sourceRGBA = `${dir}/source-${frame.frame}.rgba`;
      const decodedRGBA = `${dir}/decoded-${frame.frame}.rgba`;
      await run([
        ffmpeg,
        "-nostdin",
        "-n",
        "-v",
        "error",
        "-i",
        frame.path,
        "-frames:v",
        "1",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgba",
        sourceRGBA,
      ]);
      await run([
        ffmpeg,
        "-nostdin",
        "-n",
        "-v",
        "error",
        "-i",
        master,
        "-vf",
        `select=eq(n\\,${frame.frame})`,
        "-frames:v",
        "1",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgba",
        decodedRGBA,
      ]);
      const a = new Uint8Array(await Bun.file(sourceRGBA).arrayBuffer());
      const b = new Uint8Array(await Bun.file(decodedRGBA).arrayBuffer());
      if (
        a.length !== plan.request.width * plan.request.height * 4 ||
        b.length !== a.length ||
        new Bun.CryptoHasher("sha256").update(a).digest("hex") !==
          new Bun.CryptoHasher("sha256").update(b).digest("hex")
      )
        throw new Error("Lossless archive pixel comparison failed");
    }
    const digest = async (path: string) =>
      new Bun.CryptoHasher("sha256").update(await Bun.file(path).arrayBuffer()).digest("hex");
    const receipt = {
      plan: {
        ...plan,
        qualification: { ...plan.qualification, rendered: true, pixelMatchVerified: false },
      },
      artifact: {
        archive: { path: master, sha256: await digest(master), probe: archiveProbe },
        web: { path: web, sha256: await digest(web), probe: webProbe },
        frames,
      },
      qualification: {
        backend: "bun.WebView/chrome + bun-video captureNativeWebViewFrames + FFmpeg",
        ownerCapturePath: capturePath,
        losslessRepresentativeFramesVerified: true,
        comparison:
          "Captured composition RGBA equals decoded FFV1 first/middle/last; no external anime reference",
        browserRuntimeQualified: false,
        nativeEncodeVideoQualified: false,
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
