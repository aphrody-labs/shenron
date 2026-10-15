#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/** Capture only the publisher's anonymous trial through its normal browser renderer. */
import { chmod, lstat, mkdir, realpath } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

interface SourcePage {
  type: string;
  src?: string;
  width?: number;
  height?: number;
}
interface RenderedPage {
  index: number;
  rect: { x: number; y: number; width: number; height: number };
  width: number;
  height: number;
}
// Runtime exports are qualified independently of the older published type package.
interface NativeChromium {
  launch(options: {
    executable: string;
    headless: boolean;
    webgpu: boolean;
    timeout: number;
    signal: AbortSignal;
  }): Promise<{
    connection: {
      send<T = Record<string, unknown>>(
        method: string,
        parameters: Record<string, unknown>,
        sessionId?: string,
      ): Promise<T>;
      on(method: string, listener: (event: unknown, sessionId?: string) => void): () => void;
    };
    close(): Promise<void>;
  }>;
}

export async function capturePublicReaderTrial(job: string, sourceUrl: string, maxPages = 64) {
  const url = new URL(sourceUrl);
  if (
    !isAbsolute(job) ||
    url.origin !== "https://shonenjumpplus.com" ||
    !/^\/volume\/[0-9]+\/trial$/.test(url.pathname) ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    !Number.isSafeInteger(maxPages) ||
    maxPages < 1 ||
    maxPages > 64
  )
    throw new Error("An absolute job and bounded official public trial are required");
  await mkdir(job, { recursive: true, mode: 0o700 });
  const info = await lstat(job);
  if (info.isSymbolicLink() || info.mode & 0o077 || (await realpath(job)) !== resolve(job))
    throw new Error("Capture job must be a private regular directory");
  // Existing attempts are evidence; the orchestrator owns recovery and retry identity.
  const pagesDirectory = join(job, "rendered-pages");
  await mkdir(pagesDirectory, { mode: 0o700 });
  const crawlPath = join(job, "robots.json");
  const crawler = Bun.spawn(
    [
      "/home/ubuntu/.local/bin/aphrody-web",
      "crawl",
      url.href,
      "--max-depth",
      "0",
      "--max-pages",
      "1",
      "--concurrency",
      "1",
      "--obey-robots",
      "--delay-ms",
      "2000",
      "--timeout",
      "30",
      "--format",
      "json",
      "--output",
      crawlPath,
    ],
    { stdout: Bun.file(crawlPath + ".stdout"), stderr: Bun.file(crawlPath + ".stderr") },
  );
  const crawlDeadline = setTimeout(() => crawler.kill(), 45000);
  try {
    if (await crawler.exited) throw new Error("Robots owner did not qualify the trial");
    const crawl = await Bun.file(crawlPath).json();
    if (
      crawl.errors?.length ||
      !crawl.pages?.some(
        (page: { status: number; url: string }) =>
          page.status === 200 && new URL(page.url).origin === url.origin,
      )
    )
      throw new Error("Robots-aware trial source acquisition is incomplete");
  } finally {
    clearTimeout(crawlDeadline);
  }
  const nativeModule: string = "bun:chromium";
  const { launch } = (await import(nativeModule)) as NativeChromium;
  const browser = await launch({
    executable: process.env.BUN_CHROMIUM_PATH ?? "/opt/google/chrome/chrome",
    headless: true,
    webgpu: false,
    timeout: 30000,
    signal: AbortSignal.timeout(180000),
  });
  const connection = browser.connection;
  const acquired = new Map<
    number,
    {
      page: number;
      path: string;
      sha256: string;
      size: number;
      width: number;
      height: number;
      sourceImageUrl: string;
      sourceDocument: string;
      rendering: string;
    }
  >();
  try {
    const { targetId } = await connection.send<{ targetId: string }>("Target.createTarget", {
      url: "about:blank",
    });
    const { sessionId } = await connection.send<{ sessionId: string }>("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    await connection.send("Page.enable", {}, sessionId);
    await connection.send(
      "Emulation.setDeviceMetricsOverride",
      { width: 1000, height: 1600, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );
    async function navigate(address: string) {
      let remove = () => {};
      let timer: ReturnType<typeof setTimeout>;
      const loaded = new Promise<void>((done, fail) => {
        remove = connection.on("Page.loadEventFired", (_event, id) => {
          if (id === sessionId) done();
        });
        timer = setTimeout(() => fail(new Error("Public viewer load deadline exceeded")), 45000);
      });
      try {
        const navigation = await connection.send<{ errorText?: string }>(
          "Page.navigate",
          { url: address },
          sessionId,
        );
        if (navigation.errorText) throw new Error(navigation.errorText);
        await loaded;
      } finally {
        remove();
        clearTimeout(timer!);
        void loaded.catch(() => {});
      }
    }
    async function evaluate<T>(expression: string): Promise<T> {
      const response = await connection.send<{
        result?: { value?: string };
        exceptionDetails?: unknown;
      }>("Runtime.evaluate", { expression, returnByValue: true }, sessionId);
      if (response.exceptionDetails || !response.result?.value)
        throw new Error("Public viewer DOM evaluation failed");
      return JSON.parse(response.result.value) as T;
    }
    await navigate("https://am.i.mullvad.net/json");
    const exit = await evaluate<{ country: string; city: string; mullvad_exit_ip: boolean }>(
      "document.body.innerText",
    );
    if (exit.country !== "Japan" || exit.city !== "Tokyo" || exit.mullvad_exit_ip !== true)
      throw new Error("Browser Tokyo exit is not qualified");
    await navigate(url.href);
    const product = await evaluate<{
      readableProduct: {
        id: string;
        title: string;
        isPublic: boolean;
        hasPurchased: boolean;
        pageStructure: { pages: SourcePage[] };
      };
    }>("document.querySelector('#episode-json')?.getAttribute('data-value')");
    const reader = product.readableProduct;
    if (
      reader.id !== url.pathname.split("/")[2] ||
      reader.isPublic !== true ||
      reader.hasPurchased !== false
    )
      throw new Error("The browser did not expose the anonymous public trial");
    const sourcePages = reader.pageStructure.pages;
    const main = sourcePages.filter((page) => page.type === "main" && page.src);
    if (!main.length || main.length > maxPages || sourcePages.length > maxPages + 8)
      throw new Error("Official preview exceeds the explicit page budget");
    for (const page of main) {
      const image = new URL(page.src!);
      if (
        image.origin !== "https://cdn-ak-img.shonenjumpplus.com" ||
        !image.pathname.startsWith("/public/page/") ||
        image.search
      )
        throw new Error("Trial page is outside the public publisher image owner");
    }
    await connection.send(
      "Runtime.evaluate",
      {
        expression:
          "document.querySelectorAll('header,#global-header,.global-header,nav').forEach(e=>e.style.visibility='hidden')",
      },
      sessionId,
    );
    let bytes = 0;
    const receipt = () => ({
      schema: "shenron-official-preview-capture/v1",
      sourceUrl: url.href,
      provider: "ShonenJumpPlus",
      productId: reader.id,
      title: reader.title,
      exit: { country: exit.country, city: exit.city, mullvadExit: true },
      pages: [...acquired.values()].toSorted((a, b) => a.page - b.page),
      expectedTrialPages: main.length,
      captureComplete: acquired.size === main.length,
      readerExtent: "preview",
      volumeComplete: false,
      editionMatchReviewed: false,
      visualReview: "pending",
      published: false,
    });
    for (
      let step = 0;
      step < Math.ceil(sourcePages.length / 2) + 4 && acquired.size < main.length;
      step++
    ) {
      const started = Date.now();
      const visible = await evaluate<{ dummy: boolean; pages: RenderedPage[] }>(
        "JSON.stringify({dummy:!!document.querySelector('.js-viewer-content > :first-child .page-dummy'),pages:[...document.querySelectorAll('.js-viewer-content canvas.page-image')].map(c=>({index:[...c.parentElement.parentElement.children].indexOf(c.parentElement),width:c.width,height:c.height,rect:c.getBoundingClientRect().toJSON()})).filter(p=>p.rect.width>200&&p.rect.height>200&&p.rect.x>=0&&p.rect.x+p.rect.width<=1000&&p.rect.y>=0&&p.rect.y+p.rect.height<=1600)})",
      );
      for (const canvas of visible.pages) {
        const index = canvas.index - (visible.dummy ? 1 : 0),
          source = sourcePages[index];
        if (!source || source.type !== "main" || !source.src) continue;
        const number = main.indexOf(source) + 1;
        if (acquired.has(number)) continue;
        if (
          !source.width ||
          !source.height ||
          canvas.width !== source.width ||
          canvas.height !== source.height
        )
          throw new Error("Rendered canvas does not match its public source page");
        const screenshot = await connection.send<{ data: string }>(
          "Page.captureScreenshot",
          {
            format: "png",
            captureBeyondViewport: false,
            clip: {
              x: canvas.rect.x,
              y: canvas.rect.y,
              width: canvas.rect.width,
              height: canvas.rect.height,
              scale: source.width / canvas.rect.width,
            },
          },
          sessionId,
        );
        const image = Uint8Array.from(atob(screenshot.data), (value) => value.charCodeAt(0));
        bytes += image.length;
        if (image.length > 8 * 1024 * 1024 || bytes > 128 * 1024 * 1024)
          throw new Error("Rendered image budget exceeded");
        const metadata = await new Bun.Image(image, { maxPixels: 10000000 }).metadata();
        if (
          Math.abs(metadata.width - source.width) > 1 ||
          Math.abs(metadata.height - source.height) > 1
        )
          throw new Error("Screenshot geometry differs from the source canvas");
        const path = join(pagesDirectory, String(number).padStart(3, "0") + ".png");
        await Bun.write(path, image);
        await chmod(path, 0o600);
        acquired.set(number, {
          page: number,
          path,
          sha256: new Bun.CryptoHasher("sha256").update(image).digest("hex"),
          size: image.length,
          width: metadata.width,
          height: metadata.height,
          sourceImageUrl: source.src,
          sourceDocument: url.href,
          rendering: "official-public-viewer-screenshot",
        });
      }
      await Bun.write(join(job, "preview-capture.json"), JSON.stringify(receipt(), null, 2));
      await chmod(join(job, "preview-capture.json"), 0o600);
      for (const type of ["keyDown", "keyUp"])
        await connection.send(
          "Input.dispatchKeyEvent",
          {
            type,
            key: "ArrowLeft",
            code: "ArrowLeft",
            windowsVirtualKeyCode: 37,
            nativeVirtualKeyCode: 37,
          },
          sessionId,
        );
      const delay = 2000 - (Date.now() - started);
      if (delay > 0) await Bun.sleep(delay);
    }
    return receipt();
  } finally {
    await browser.close();
  }
}
