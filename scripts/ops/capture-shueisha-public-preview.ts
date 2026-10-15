#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { mkdir, chmod, lstat, realpath } from "node:fs/promises";
import { join, resolve, isAbsolute } from "node:path";
type Rect = { x: number; y: number; width: number; height: number; right: number; bottom: number };
type Image = { src: string; w: number; h: number; rect: Rect };
export function previewIdentity(source: string) {
  const u = new URL(source);
  if (
    u.origin !== "https://www.shueisha.co.jp" ||
    u.pathname !== "/books/reader/main.php" ||
    u.hash ||
    u.username ||
    u.password ||
    [...u.searchParams.keys()].join() !== "cid" ||
    !/^978[0-9]{10}$/.test(u.searchParams.get("cid") ?? "")
  )
    throw Error("Exact anonymous Shueisha preview required");
  return u.searchParams.get("cid")!;
}
export function previewPosition(label: string, total: number) {
  const m = /^(\d+)\/(\d+)$/.exec(label.trim());
  if (!m || Number(m[2]) !== total || Number(m[1]) < 1 || Number(m[1]) > total || total > 64)
    throw Error("Unexpected public reader position");
  return Number(m[1]);
}
export function visiblePageClip(images: Image[], width = 1200, height = 1200) {
  const eligible = images.filter(
    (i) =>
      i.src.startsWith("blob:https://www.shueisha.co.jp/") &&
      i.w > 300 &&
      i.h > 200 &&
      i.rect.x >= 0 &&
      i.rect.right <= width &&
      i.rect.y >= 0 &&
      i.rect.bottom <= height &&
      i.rect.width > 300,
  );
  const groups = new Map<number, Image[]>();
  for (const i of eligible) {
    const key = Math.round(i.rect.x);
    groups.set(key, [...(groups.get(key) ?? []), i]);
  }
  for (const group of [...groups.values()].sort(
    (a, b) =>
      Math.abs(a[0]!.rect.x + a[0]!.rect.width / 2 - width / 2) -
      Math.abs(b[0]!.rect.x + b[0]!.rect.width / 2 - width / 2),
  )) {
    const parts = group.toSorted((a, b) => a.rect.y - b.rect.y);
    if (
      parts.length !== 3 ||
      parts[0]!.rect.y !== 0 ||
      Math.abs(parts[2]!.rect.bottom - height) > 1 ||
      parts.some((p, i) => i > 0 && p.rect.y > parts[i - 1]!.rect.bottom + 1)
    )
      continue;
    return { x: parts[0]!.rect.x, y: 0, width: parts[0]!.rect.width, height, scale: 1 };
  }
  throw Error("A complete visible publisher page is required");
}
interface Connection {
  send<T = any>(
    method: string,
    parameters?: Record<string, unknown>,
    sessionId?: string,
  ): Promise<T>;
  close(): void;
}
export async function captureShueishaPreview(
  job: string,
  source: string,
  total: number,
  expectedTitle: string,
) {
  process.umask(0o077);
  const cid = previewIdentity(source);
  if (!isAbsolute(job) || !Number.isSafeInteger(total) || total < 1 || total > 64 || !expectedTitle)
    throw Error("Private bounded capture required");
  await mkdir(job, { mode: 0o700 });
  const st = await lstat(job);
  if (st.isSymbolicLink() || st.mode & 0o077 || (await realpath(job)) !== resolve(job))
    throw Error("Private regular directory required");
  const robots = join(job, "robots.json");
  const crawler = Bun.spawn(
    [
      "/home/ubuntu/.local/bin/aphrody-web",
      "crawl",
      source,
      "--max-depth",
      "0",
      "--max-pages",
      "1",
      "--concurrency",
      "1",
      "--obey-robots",
      "--proxy",
      "socks5h://127.0.0.1:1080",
      "--delay-ms",
      "2000",
      "--timeout",
      "45",
      "--format",
      "json",
      "--output",
      robots,
    ],
    { stdout: Bun.file(robots + ".stdout"), stderr: Bun.file(robots + ".stderr") },
  );
  if (await crawler.exited) throw Error("Robots owner failed");
  const gate = await Bun.file(robots).json();
  await chmod(robots, 0o600);
  if (gate.errors?.length || !gate.pages?.some((p: any) => p.url === source && p.status === 200))
    throw Error("Robots qualification required");
  const profile = join(job, "profile");
  await mkdir(profile, { mode: 0o700 });
  const executable = "/opt/google/chrome/chrome";
  const child = Bun.spawn(
    [
      executable,
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-background-networking",
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--proxy-server=socks5://127.0.0.1:1080",
      "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
      "about:blank",
    ],
    { stdout: Bun.file(join(job, "chrome.stdout")), stderr: Bun.file(join(job, "chrome.stderr")) },
  );
  let connection: Connection | undefined;
  const pages: Array<Record<string, unknown>> = [];
  const receipt: any = {
    schema: "shenron-shueisha-public-preview-capture/v1",
    startedAt: new Date().toISOString(),
    sourceUrl: source,
    isbn: cid,
    expectedTitle,
    expectedTrialPositions: total,
    browserExecutable: executable,
    browserPid: child.pid,
    runtime: process.execPath,
    revision: Bun.revision,
    nativeLayer: "Bun.spawn + bun:chromium CDP",
    readerExtent: { kind: "preview", fullVolumePages: null, sourceUrl: source },
    positionsIncludeCover: null,
    captureComplete: false,
    volumeComplete: false,
    published: false,
    paidBypass: false,
    pages,
  };
  const save = async () => {
    await Bun.write(join(job, "receipt.json"), JSON.stringify(receipt, null, 2));
    await chmod(join(job, "receipt.json"), 0o600);
  };
  try {
    const d = Date.now() + 15000;
    while (!(await Bun.file(join(profile, "DevToolsActivePort")).exists())) {
      if (Date.now() > d) throw Error("Chrome launch deadline");
      await Bun.sleep(100);
    }
    const [port, path] = (await Bun.file(join(profile, "DevToolsActivePort")).text())
      .trim()
      .split("\n");
    const name: string = "bun:chromium";
    const native = (await import(name)) as {
      connect(endpoint: string, options: { timeout: number }): Promise<Connection>;
    };
    connection = await native.connect(`ws://127.0.0.1:${port}${path}`, { timeout: 60000 });
    receipt.browserVersion = await connection.send("Browser.getVersion");
    const { targetId } = await connection.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await connection.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    const cmd = (m: string, p: Record<string, unknown> = {}) => connection!.send(m, p, sessionId);
    const dom = async (e: string) =>
      (await cmd("Runtime.evaluate", { expression: e, returnByValue: true })).result.value;
    await cmd("Page.enable");
    await cmd("Runtime.enable");
    await cmd("Emulation.setDeviceMetricsOverride", {
      width: 1200,
      height: 1200,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cmd("Page.navigate", { url: "https://am.i.mullvad.net/json" });
    let exit: any;
    const until = Date.now() + 20000;
    do {
      try {
        exit = JSON.parse(await dom("document.body.innerText"));
        if (exit.country) break;
      } catch {}
      await Bun.sleep(200);
    } while (Date.now() < until);
    if (exit?.country !== "Japan" || exit.city !== "Tokyo" || exit.mullvad_exit_ip !== true)
      throw Error("Actual Chrome Tokyo exit required");
    receipt.egress = { country: exit.country, city: exit.city, mullvadExit: true };
    await cmd("Page.navigate", { url: source });
    const state = () =>
      dom(
        `({url:location.href,title:document.title,position:document.querySelector('#menu_slidercaption')?.textContent,images:[...document.images].map(i=>({src:i.currentSrc||i.src,w:i.naturalWidth,h:i.naturalHeight,rect:i.getBoundingClientRect().toJSON()}))})`,
      );
    async function stable(ordinal: number) {
      let prior = "",
        repeated = 0;
      const deadline = Date.now() + 45000;
      do {
        const s = await state();
        try {
          if (
            s.url !== source ||
            !s.title.includes(expectedTitle) ||
            previewPosition(s.position ?? "", total) !== ordinal
          )
            throw Error("Identity or ordinal waiting");
          const clip = visiblePageClip(s.images);
          const signature = JSON.stringify({ position: s.position, images: s.images });
          repeated = signature === prior ? repeated + 1 : 0;
          prior = signature;
          if (repeated >= 6) return { s, clip, terminal: false };
        } catch {
          repeated = 0;
        }
        await Bun.sleep(150);
      } while (Date.now() < deadline);
      const s = await state();
      if (ordinal === total) {
        const diagnostic = await cmd("Page.captureScreenshot", { format: "png" });
        const path = join(job, "terminal-diagnostic.png");
        await Bun.write(path, Buffer.from(diagnostic.data, "base64"));
        receipt.terminalDiagnostic = {
          path,
          observedPosition: s.position,
          text: await dom("document.body.innerText"),
          sourceUrl: s.url,
        };
        await save();
      }
      if (
        ordinal === total &&
        s.url === source &&
        s.title.includes(expectedTitle) &&
        previewPosition(s.position ?? "", total) === total
      ) {
        // Preserve the public last screen as UI evidence, never claim it as a manga page.
        return { s, clip: { x: 0, y: 0, width: 1200, height: 1200, scale: 1 }, terminal: true };
      }
      throw Error(`Complete stable page ${ordinal} did not render`);
    }
    // Only ordinary public keyboard navigation. Never call the viewer's JavaScript API.
    for (let ordinal = 1; ordinal <= total; ordinal++) {
      const { s, clip, terminal } = await stable(ordinal);
      receipt.title = s.title;
      const shot = await cmd("Page.captureScreenshot", { format: "png", clip });
      const bytes = Buffer.from(shot.data, "base64");
      if (bytes.length > 8 * 1024 * 1024) throw Error("Raster budget exceeded");
      const sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
      if (pages.some((p) => p.sha256 === sha256)) throw Error("Duplicate raster requires review");
      const path = join(job, `position-${String(ordinal).padStart(3, "0")}.png`);
      await Bun.write(path, bytes);
      await chmod(path, 0o600);
      pages.push({
        sourceOrdinal: ordinal,
        sourcePosition: s.position,
        role: terminal ? "terminal-ui-unqualified" : "preview-position-unclassified",
        path,
        sha256,
        bytes: bytes.length,
        width: bytes.readUInt32BE(16),
        height: bytes.readUInt32BE(20),
        clip,
        rendering: "normal public Chrome viewport screenshot; no raw tiles",
      });
      await save();
      console.log(JSON.stringify({ cid, ordinal, total, sha256 }));
      if (ordinal < total) {
        await cmd("Input.dispatchKeyEvent", {
          type: "keyDown",
          key: "ArrowLeft",
          code: "ArrowLeft",
          windowsVirtualKeyCode: 37,
        });
        await cmd("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: "ArrowLeft",
          code: "ArrowLeft",
          windowsVirtualKeyCode: 37,
        });
      }
    }
    receipt.captureComplete = pages.length === total;
  } catch (error) {
    receipt.error = String(error);
    throw error;
  } finally {
    receipt.finishedAt = new Date().toISOString();
    await save();
    connection?.close();
    child.kill();
    await child.exited;
  }
  return receipt;
}
if (import.meta.main) {
  const [job, source, total, title] = process.argv.slice(2);
  captureShueishaPreview(job!, source!, Number(total), title!).catch((error) => {
    console.error(String(error));
    process.exitCode = 1;
  });
}
