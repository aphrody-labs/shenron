#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/** Private, bounded browser evidence. Run inside the already qualified Tokyo namespace. */
import { mkdir, chmod, readlink, realpath } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

const targets = [
  ["https://books.shueisha.co.jp/items/contents.html?isbn=978-4-08-111166-4"],
  ["https://www.cdjapan.co.jp/product/NEOBK-2031986", "https://books.rakuten.co.jp/rb/14606453/"],
];

export function browserProvenance(
  version: Record<string, unknown>,
  ownerEngine?: unknown,
  provider?: unknown,
) {
  const observed = (value: unknown) =>
    typeof value === "string" && value.length ? value : "unknown";
  return {
    provider: observed(provider),
    ownerReportedEngine: observed(ownerEngine),
    // CDP products and user agents may be emulated; they do not qualify an engine.
    engine: "unknown",
    browserVersion: Object.fromEntries(
      ["product", "revision", "protocolVersion", "userAgent", "jsVersion"].map((key) => [
        key,
        observed(version[key]),
      ]),
    ),
  };
}

export async function inspectBrowserSources(job: string, slot: number, urls: string[]) {
  if (
    !isAbsolute(job) ||
    !Number.isSafeInteger(slot) ||
    slot < 0 ||
    urls.length < 1 ||
    urls.length > 10
  )
    throw new Error("An absolute job, nonnegative worker slot and 1..10 sources are required");
  for (const value of urls) {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      throw new Error("Credential-free HTTPS sources are required");
  }
  const directory = join(job, `worker-${slot}`);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const native: string = "bun:obscura";
  const obscura = await import(native);
  // Each runtime revision discovers its own browser owner through its declared setting.
  process.env.BUN_OBSCURA_PATH ??= "/home/ubuntu/.local/bin/aphrody-web";
  process.env.BUN_CHROMIUM_PATH ??= "/opt/google/chrome/chrome";
  const executable = obscura.findExecutable();
  if (!executable) throw new Error("The runtime's native browser owner is unavailable");
  const browser = await obscura.launch({
    executable,
    headless: true,
    workers: 1,
    webgpu: false,
    timeout: 20000,
    signal: AbortSignal.timeout(240000),
  });
  const connection = browser.connection;
  const observations: Record<string, unknown>[] = [];
  try {
    const version = await connection.send("Browser.getVersion").catch(() => ({}));
    const launcherExecutable = await realpath(executable).catch(() => "unknown");
    const ownerExecutable = browser.process?.pid
      ? await readlink(`/proc/${browser.process.pid}/exe`).catch(() => "unknown")
      : "unknown";
    const processes = await connection.send("SystemInfo.getProcessInfo").catch(() => ({}));
    const browserPid = processes.processInfo?.find(
      (entry: { type: string }) => entry.type === "browser",
    )?.id;
    const browserExecutable =
      Number.isSafeInteger(browserPid) && browserPid > 0
        ? await readlink(`/proc/${browserPid}/exe`).catch(() => "unknown")
        : "unknown";
    const { targetId } = await connection.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await connection.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    await connection.send("Page.enable", {}, sessionId);
    async function dom(url: string) {
      let remove = () => {};
      let timer: ReturnType<typeof setTimeout>;
      const loaded = new Promise<void>((resolve, reject) => {
        remove = connection.on("Page.loadEventFired", (_event: unknown, id: string) => {
          if (id === sessionId) resolve();
        });
        timer = setTimeout(() => reject(new Error("Browser load deadline exceeded")), 25000);
      });
      try {
        const navigation = await connection.send("Page.navigate", { url }, sessionId);
        if (navigation.errorText) throw new Error(navigation.errorText);
        await loaded;
        const evaluated = await connection.send(
          "Runtime.evaluate",
          {
            expression: `JSON.stringify({url:location.href,title:document.title,text:document.body?.innerText.slice(0,60000),links:[...document.querySelectorAll('a[href]')].map(a=>({url:a.href,text:a.textContent?.trim().slice(0,120)})).slice(0,500),frames:[...document.querySelectorAll('iframe[src]')].map(a=>a.src),images:[...document.images].slice(0,30).map(a=>({url:a.currentSrc||a.src,width:a.naturalWidth,height:a.naturalHeight})),embeddedReaderData:[...document.querySelectorAll('[data-value]')].filter(e=>/episode|product|viewer|reader/i.test(e.id)).slice(0,5).map(e=>({id:e.id,value:e.getAttribute('data-value')?.slice(0,100000)}))})`,
            returnByValue: true,
          },
          sessionId,
        );
        if (evaluated.exceptionDetails || !evaluated.result?.value)
          throw new Error("DOM evaluation failed");
        return JSON.parse(evaluated.result.value);
      } finally {
        remove();
        clearTimeout(timer!);
        // Observe rejection if navigation failed before the load was awaited.
        void loaded.catch(() => {});
      }
    }
    const exitPage = await dom("https://am.i.mullvad.net/json");
    const exit = JSON.parse(exitPage.text);
    if (exit.country !== "Japan" || exit.city !== "Tokyo" || exit.mullvad_exit_ip !== true)
      throw new Error("Browser Tokyo exit not qualified");
    for (const url of urls) {
      try {
        const file = join(directory, `robots-${observations.length}.json`);
        const crawler = Bun.spawn(
          [
            "/home/ubuntu/.local/bin/aphrody-web",
            "crawl",
            url,
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
            file,
          ],
          { stdout: Bun.file(file + ".stdout"), stderr: Bun.file(file + ".stderr") },
        );
        const crawlDeadline = setTimeout(() => crawler.kill(), 45000);
        const code = await crawler.exited.finally(() => clearTimeout(crawlDeadline));
        if (code) throw new Error(`Robots owner exit ${code}`);
        const crawl = await Bun.file(file).json();
        if (
          !crawl.pages?.some((page: { status: number }) => page.status === 200) ||
          crawl.errors?.length
        )
          throw new Error("Robots-aware source acquisition incomplete");
        const page = await dom(url);
        observations.push({
          sourceUrl: url,
          status: "observed",
          page,
          previewCandidates: page.links.filter((link: { text: string; url: string }) =>
            /試し読み|立ち読み|preview|sample|viewer|電子書籍|電子版|\be-?books?\b|(?:\/|[?&])read(?:\/|=)/i.test(
              link.text + " " + link.url,
            ),
          ),
          readerComplete: false,
        });
      } catch (error) {
        observations.push({ sourceUrl: url, status: "failed", error: String(error) });
      }
    }
    const receipt = {
      slot,
      ...browserProvenance(version, browser.engine, browser.provider),
      executable,
      launcherExecutable,
      ownerExecutable,
      browserExecutable,
      runtime: Bun.revision,
      exit: { country: exit.country, city: exit.city, mullvadExit: true },
      observations,
      published: false,
    };
    const receiptPath = join(directory, "browser-receipt.json");
    await Bun.write(receiptPath, JSON.stringify(receipt, null, 2));
    await chmod(receiptPath, 0o600);
    return receipt;
  } finally {
    await browser.close();
  }
}

if (!Bun.isMainThread && process.env.SOSH_BROWSER_WORKER_ENTRY === "1") {
  self.onmessage = async ({ data }) => {
    try {
      self.postMessage({
        ok: true,
        receipt: await inspectBrowserSources(data.job, data.slot, data.urls),
      });
    } catch (error) {
      self.postMessage({ ok: false, slot: data.slot, error: String(error) });
    }
  };
} else if (Bun.isMainThread && import.meta.main) {
  const job = process.argv[2];
  if (!job || !isAbsolute(job)) throw new Error("An absolute private job directory is required");
  await mkdir(job, { recursive: true, mode: 0o700 });
  await chmod(job, 0o700);
  const receipts = await Promise.all(
    targets.map(
      (urls, slot) =>
        new Promise((resolve) => {
          const worker = new Worker(import.meta.url, {
            env: { ...process.env, SOSH_BROWSER_WORKER_ENTRY: "1" },
          });
          const timer = setTimeout(() => {
            worker.terminate();
            resolve({ ok: false, slot, error: "Worker deadline exceeded" });
          }, 180000);
          worker.onmessage = ({ data }) => {
            clearTimeout(timer);
            worker.terminate();
            resolve(data);
          };
          worker.onerror = (error) => {
            clearTimeout(timer);
            worker.terminate();
            resolve({ ok: false, slot, error: error.message });
          };
          worker.postMessage({ job, slot, urls });
        }),
    ),
  );
  const receipt = {
    schema: "shenron-sosh-browser-discovery/v1",
    workers: 2,
    at: new Date().toISOString(),
    receipts,
    readerComplete: false,
    published: false,
  };
  await Bun.write(join(job, "receipt.json"), JSON.stringify(receipt, null, 2));
  console.log(
    JSON.stringify({ workers: 2, receipt: join(job, "receipt.json"), readerComplete: false }),
  );
}
