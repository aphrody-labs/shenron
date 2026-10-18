// SPDX-License-Identifier: Apache-2.0
import { Database } from "bun:sqlite";
import { appendFile, chmod, mkdir, lstat, realpath, rmdir, unlink } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { hostname } from "node:os";

// Installed runtime exports are qualified independently of its older published type package.
interface NativeConnection {
  send<T = unknown>(
    method: string,
    parameters?: Record<string, unknown>,
    session?: string,
  ): Promise<T>;
  on(
    method: string,
    listener: (parameters: Record<string, unknown>, session?: string) => void,
  ): () => void;
  close(): void;
}
interface NativeObscura {
  findExecutable(): string | null;
  connect(
    endpoint: string,
    options: { timeout: number; signal: AbortSignal },
  ): Promise<NativeConnection>;
}
async function nativeBrowser(): Promise<NativeObscura> {
  const nativeSpecifier: string = "bun:obscura";
  const nativeModule = await import(nativeSpecifier);
  if (
    typeof nativeModule.connect !== "function" ||
    typeof nativeModule.findExecutable !== "function"
  )
    throw new Error("Installed Bun has no qualified native Obscura exports");
  return nativeModule as NativeObscura;
}

const hosts = new Set([
  "www.glenat.com",
  "www.shueisha.co.jp",
  "www.carddass.com",
  "www.hanmoto.com",
]);
export const hash = (bytes: string | Uint8Array) =>
  new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
export interface Source {
  sourceUrl: string;
  sourceObservedStatus: 200;
  sourceCaptureVerified: true;
}
export function sourcePlan(input: unknown, maximum = 256): Source[] {
  if (
    !Number.isInteger(maximum) ||
    maximum < 1 ||
    maximum > 256 ||
    !Array.isArray(input) ||
    !input.length ||
    input.length > maximum
  )
    throw new Error("Source list exceeds its explicit bound");
  const seen = new Set<string>();
  return input.map((value) => {
    if (!value || typeof value !== "object") throw new Error("Invalid source record");
    const row = value as Record<string, unknown>;
    if (
      typeof row.sourceUrl !== "string" ||
      row.sourceObservedStatus !== 200 ||
      row.sourceCaptureVerified !== true
    )
      throw new Error("Source lacks an independently observed primary capture");
    const url = new URL(row.sourceUrl);
    if (
      url.protocol !== "https:" ||
      !hosts.has(url.hostname) ||
      url.username ||
      url.password ||
      url.port ||
      url.hash ||
      seen.has(url.href)
    )
      throw new Error("Source is outside the exact primary allowlist");
    seen.add(url.href);
    return { sourceUrl: url.href, sourceObservedStatus: 200, sourceCaptureVerified: true };
  });
}
export function tokyoExit(text: string) {
  const value = JSON.parse(text) as Record<string, unknown>;
  if (value.country !== "Japan" || value.city !== "Tokyo" || value.mullvad_exit_ip !== true)
    throw new Error("Native browser has no qualified Tokyo exit");
  return { country: "Japan", city: "Tokyo", mullvadExit: true };
}
export function verifyDom(value: unknown, sourceUrl: string) {
  if (!value || typeof value !== "object") throw new Error("No native DOM receipt");
  const dom = value as Record<string, unknown>;
  if (
    dom.url !== sourceUrl ||
    typeof dom.title !== "string" ||
    typeof dom.text !== "string" ||
    dom.text.length < 100 ||
    /404|403|Not Found|Forbidden|Access Denied/i.test(dom.title)
  )
    throw new Error("Primary source has not rendered successfully");
  return { url: sourceUrl, title: dom.title, text: dom.text };
}
export function frontier(database: Database, sources: Source[], identity: string) {
  database.exec(
    "CREATE TABLE IF NOT EXISTS identity (sha TEXT PRIMARY KEY);" +
      "CREATE TABLE IF NOT EXISTS queue (url TEXT PRIMARY KEY, state TEXT NOT NULL, receipt_sha TEXT);",
  );
  const existing = database.query<{ sha: string }, []>("SELECT sha FROM identity").get();
  if (existing && existing.sha !== identity)
    throw new Error("Private frontier belongs to another plan");
  database.query("INSERT OR IGNORE INTO identity VALUES (?)").run(identity);
  const insert = database.query("INSERT OR IGNORE INTO queue VALUES (?, 'pending', NULL)");
  database.transaction(() => {
    for (const source of sources) insert.run(source.sourceUrl);
  })();
  return {
    next() {
      return database.transaction(() => {
        const row = database
          .query<{ url: string }, []>(
            "SELECT url FROM queue WHERE state='pending' ORDER BY rowid LIMIT 1",
          )
          .get();
        if (row) database.query("UPDATE queue SET state='running' WHERE url=?").run(row.url);
        return row?.url;
      })();
    },
    complete(url: string, digest: string) {
      database
        .query("UPDATE queue SET state='qualified', receipt_sha=? WHERE url=?")
        .run(digest, url);
    },
    fail(url: string) {
      database.query("UPDATE queue SET state='failed' WHERE url=?").run(url);
    },
    recoverInterrupted(provedDead: boolean) {
      const rows = database
        .query<{ url: string }, []>("SELECT url FROM queue WHERE state='running'")
        .all();
      if (rows.length && !provedDead) throw Error("Interrupted frontier lacks dead-owner proof");
      if (provedDead) database.exec("UPDATE queue SET state='pending' WHERE state='running'");
      return rows.map((row) => row.url);
    },
    finishStoppedRun() {
      const rows = database
        .query<{ url: string }, []>("SELECT url FROM queue WHERE state='running'")
        .all();
      database.exec("UPDATE queue SET state='pending' WHERE state='running'");
      return rows.map((row) => row.url);
    },
    rows() {
      return database
        .query<{ url: string; state: string; receipt_sha: string | null }, []>(
          "SELECT * FROM queue ORDER BY rowid",
        )
        .all();
    },
  };
}

export interface QualifiedPublisher {
  plan(): Promise<{ planSha256: string }>;
  apply(planSha256: string): Promise<unknown>;
  readback(receipt: unknown): Promise<boolean>;
}
export async function publishQualified(publisher: QualifiedPublisher) {
  const plan = await publisher.plan();
  if (!/^[a-f0-9]{64}$/.test(plan.planSha256))
    throw new Error("Publisher plan has no qualified identity");
  const receipt = await publisher.apply(plan.planSha256);
  if (!(await publisher.readback(receipt))) throw new Error("Publisher live readback failed");
  return receipt;
}
export function publicationIndexPath(publicRoot: string, target: string) {
  const url = new URL(target);
  if (
    url.origin !== "https://dragonballfr.com" ||
    !/^\/publications\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(url.pathname) ||
    url.search ||
    url.hash
  )
    throw Error("Unsupported publication target");
  return join(publicRoot, url.pathname.slice(1), "index.json");
}
export function deadOwner(
  record: unknown,
  identity: string,
  host: string,
  isAlive: (pid: number) => boolean,
) {
  if (!record || typeof record !== "object") throw Error("Incomplete worker claim; preserve it");
  const prior = record as Record<string, unknown>;
  if (
    prior.schema !== "shenron-reader-worker-claim/v1" ||
    prior.identity !== identity ||
    prior.host !== host ||
    typeof prior.pid !== "number" ||
    !Number.isSafeInteger(prior.pid) ||
    prior.pid < 1 ||
    isAlive(prior.pid)
  )
    throw Error("Worker claim belongs to an active or unqualified owner");
  return prior.pid;
}
async function claimRun(lock: string, identity: string) {
  let recoveredPid: number | null = null;
  try {
    await mkdir(lock, { mode: 0o700 });
  } catch (error) {
    if ((error as { code?: string }).code !== "EEXIST") throw error;
    const info = await lstat(lock),
      file = join(lock, "owner.json"),
      ownerInfo = await lstat(file);
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      info.mode & 0o077 ||
      ownerInfo.isSymbolicLink() ||
      !ownerInfo.isFile() ||
      (await realpath(lock)) !== lock
    )
      throw Error("Invalid private worker claim", { cause: error });
    recoveredPid = deadOwner(await Bun.file(file).json(), identity, hostname(), (pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (e) {
        if ((e as { code?: string }).code === "ESRCH") return false;
        throw e;
      }
    });
    await unlink(file);
    await rmdir(lock);
    await mkdir(lock, { mode: 0o700 });
  }
  const file = join(lock, "owner.json");
  await Bun.write(
    file,
    JSON.stringify({
      schema: "shenron-reader-worker-claim/v1",
      identity,
      pid: process.pid,
      host: hostname(),
      startedAt: new Date().toISOString(),
    }),
  );
  await chmod(file, 0o600);
  return recoveredPid;
}
export async function installedPublisher(
  publicRoot: string,
  target: string,
  job: string,
): Promise<QualifiedPublisher | undefined> {
  const modulePath = process.env.SHENRON_SOURCE_CDN_MODULE,
    configPath = process.env.SHENRON_SOURCE_CDN_CONFIG;
  if (!modulePath || !configPath) return undefined;
  if (
    !isAbsolute(modulePath) ||
    !modulePath.replaceAll("\\", "/").endsWith("/cloudflare/cli/publish-catalog.ts") ||
    !isAbsolute(configPath)
  )
    throw Error("Publisher must use the installed canonical owner");
  const info = await lstat(configPath);
  if (!info.isFile() || info.isSymbolicLink() || info.mode & 0o077)
    throw Error("Publisher configuration must remain private");
  const url = new URL(target);
  if (
    url.origin !== "https://dragonballfr.com" ||
    !/^\/publications\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(url.pathname) ||
    url.search ||
    url.hash
  )
    throw Error("Unsupported publication target");
  const config = await Bun.file(configPath).json();
  const { canonicalPublisherSha256, nativeOriginPreparation, ...publisherConfig } = config;
  const ownerInfo = await lstat(modulePath);
  if (
    !/^[a-f0-9]{64}$/.test(canonicalPublisherSha256 ?? "") ||
    !ownerInfo.isFile() ||
    ownerInfo.isSymbolicLink() ||
    ownerInfo.size > 1024 * 1024 ||
    (process.platform !== "win32" &&
      (ownerInfo.mode & 0o022 || ownerInfo.uid !== process.getuid?.())) ||
    hash(await Bun.file(modulePath).bytes()) !== canonicalPublisherSha256
  )
    throw Error("Canonical publisher capability changed");
  const moduleUrl = Bun.pathToFileURL(modulePath);
  moduleUrl.searchParams.set("sha256", canonicalPublisherSha256);
  const owner = await import(moduleUrl.href);
  if (typeof owner.publishCatalog !== "function") throw Error("Canonical publisher export missing");
  const index = Bun.file(publicationIndexPath(publicRoot, target));
  if (index.size > 2 * 1024 * 1024) throw Error("Public index exceeds its qualified bound");
  const indexSha256 = hash(await index.bytes());
  const options = {
    ...publisherConfig,
    publicRoot: await realpath(publicRoot),
    targetUrl: url.href,
    job: join(job, "cdn"),
  };
  const cdn = new URL(config.cdnOrigin);
  if (
    cdn.protocol !== "https:" ||
    cdn.username ||
    cdn.password ||
    !/^cdn\.dragonballfr\.com$/.test(cdn.hostname)
  )
    throw Error("Unqualified public CDN origin");
  const indexUrl = new URL(url.pathname + "/index.json", cdn).href;
  const publisher = lazyNativePublisher(options, owner, async () => {
    if (!nativeOriginPreparation) return options;
    const reference = nativeOriginPreparation;
    if (!isAbsolute(reference.modulePath) || !/^[a-f0-9]{64}$/.test(reference.moduleSha256 ?? ""))
      throw Error("Pinned native preparation capability required");
    const preparationInfo = await lstat(reference.modulePath);
    if (
      !preparationInfo.isFile() ||
      preparationInfo.isSymbolicLink() ||
      preparationInfo.size > 1024 * 1024 ||
      (process.platform !== "win32" &&
        (preparationInfo.mode & 0o022 || preparationInfo.uid !== process.getuid?.())) ||
      hash(await Bun.file(reference.modulePath).bytes()) !== reference.moduleSha256
    )
      throw Error("Native preparation capability changed");
    if (
      reference.input?.stateDirectory !== options.stateDirectory ||
      reference.input?.inventoryRoot !== options.inventoryRoot
    )
      throw Error("Native preparation belongs to another publication state");
    const preparationUrl = Bun.pathToFileURL(reference.modulePath);
    preparationUrl.searchParams.set("sha256", reference.moduleSha256);
    const preparationOwner = await import(preparationUrl.href);
    if (typeof preparationOwner.prepareNativeOriginPublication !== "function")
      throw Error("Native preparation capability unavailable");
    const prepared = await preparationOwner.prepareNativeOriginPublication({
      ...reference.input,
      job: options.job,
    });
    return preparedPublicationOptions(options, reference.input, prepared);
  });
  return {
    ...publisher,
    async readback(receipt) {
      if (!receipt || typeof receipt !== "object") return false;
      const value = receipt as Record<string, unknown>;
      if (
        value.indexSha256 !== indexSha256 ||
        typeof value.inventorySha256 !== "string" ||
        !/^[a-f0-9]{64}$/.test(value.inventorySha256)
      )
        return false;
      const response = await fetch(indexUrl, {
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      if (response.status !== 200) return false;
      const bytes = await response.bytes();
      return bytes.length <= 2 * 1024 * 1024 && hash(bytes) === indexSha256;
    },
  };
}
type PublisherOptions = Record<string, unknown>;
export function preparedPublicationOptions(
  options: PublisherOptions,
  input: Record<string, unknown>,
  prepared: Record<string, unknown>,
): PublisherOptions {
  const pins = prepared.configuration as Record<string, unknown> | undefined;
  const names = [
    "configSha256",
    "consumerCodeSha256",
    "unitSha256",
    "inventoryRoot",
    "backupReceipt",
    "backupReceiptSha256",
  ];
  if (
    prepared.schema !== "aphrody-origin-publication-preparation/v1" ||
    !pins ||
    Object.keys(pins).length !== names.length ||
    names.some((key) => typeof pins[key] !== "string") ||
    hash(JSON.stringify(pins)) !== prepared.configurationSha256 ||
    prepared.modulePath !== input.activationModulePath ||
    prepared.moduleSha256 !== input.activationModuleSha256 ||
    pins.inventoryRoot !== options.inventoryRoot ||
    pins.consumerCodeSha256 !== input.expectedConsumerCodeSha256 ||
    pins.unitSha256 !== input.expectedUnitSha256 ||
    !isAbsolute(String(pins.backupReceipt)) ||
    !isAbsolute(String(prepared.previousInventory)) ||
    !isAbsolute(String(prepared.preparationPath)) ||
    !/^_migration\/manifests\/[a-z0-9-]+\/$/.test(String(prepared.expectedPrefix)) ||
    !/^[a-f0-9-]{36}$/.test(String(prepared.expectedDeployment)) ||
    [
      prepared.previousInventorySha256,
      prepared.expectedCodeSha256,
      prepared.stateSha256,
      pins.configSha256,
      pins.backupReceiptSha256,
    ].some((value) => !/^[a-f0-9]{64}$/.test(String(value)))
  )
    throw Error("Native publication preparation differs");
  return {
    ...options,
    previousInventory: prepared.previousInventory,
    previousInventorySha256: prepared.previousInventorySha256,
    expectedPrefix: prepared.expectedPrefix,
    expectedDeployment: prepared.expectedDeployment,
    expectedCodeSha256: prepared.expectedCodeSha256,
    nativeOriginActivation: {
      modulePath: prepared.modulePath,
      moduleSha256: prepared.moduleSha256,
      configuration: pins,
    },
  };
}
/** A single immutable preparation serves plan and apply; it is never refreshed between them. */
export function lazyNativePublisher(
  initial: PublisherOptions,
  owner: {
    publishCatalog(options: PublisherOptions): Promise<{ planSha256?: string }>;
    verifyUnchangedPublicInputs?: (options: PublisherOptions) => Promise<PublisherOptions | null>;
  },
  prepare: () => Promise<PublisherOptions>,
) {
  let options: Promise<PublisherOptions> | undefined;
  let unchanged: PublisherOptions | null | undefined;
  let plannedSha256: string | undefined;
  const resolveOptions = () => (options ??= prepare());
  return {
    async plan() {
      const pinned = await resolveOptions();
      unchanged = (await owner.verifyUnchangedPublicInputs?.(pinned)) ?? null;
      if (unchanged) {
        plannedSha256 = hash(
          JSON.stringify({
            initial,
            indexSha256: unchanged.indexSha256,
            inventorySha256: unchanged.inventorySha256,
          }),
        );
        return { planSha256: plannedSha256 };
      }
      const result = await owner.publishCatalog({ ...pinned, apply: false });
      if (!/^[a-f0-9]{64}$/.test(result.planSha256 ?? ""))
        throw Error("Canonical publisher plan identity missing");
      plannedSha256 = result.planSha256;
      return { planSha256: result.planSha256! };
    },
    async apply(planSha256: string) {
      if (!plannedSha256 || planSha256 !== plannedSha256)
        throw Error("The exact qualified publisher plan is required before apply");
      if (unchanged) return unchanged;
      return owner.publishCatalog({ ...(await resolveOptions()), apply: true, planSha256 });
    },
  };
}
interface Options {
  sources: Source[];
  job: string;
  owner: string;
  proxy: string;
  concurrency: number;
  timeout: number;
  signal?: AbortSignal;
  publisher?: QualifiedPublisher;
}
export async function collect(options: Options) {
  if (
    process.platform !== "linux" ||
    !isAbsolute(options.job) ||
    !isAbsolute(options.owner) ||
    options.proxy !== "socks5://10.200.1.2:1080" ||
    !Number.isInteger(options.concurrency) ||
    options.concurrency < 1 ||
    options.concurrency > 3 ||
    !Number.isInteger(options.timeout) ||
    options.timeout < 1 ||
    options.timeout > 1800
  )
    throw new Error("Unqualified native worker execution parameters");
  const sources = sourcePlan(options.sources);
  const obscura = await nativeBrowser();
  const job = resolve(options.job);
  await mkdir(job, { recursive: true, mode: 0o700 });
  const info = await lstat(job);
  if (info.isSymbolicLink() || info.mode & 0o077 || (await realpath(job)) !== job)
    throw new Error("Worker job must be a private, regular directory");
  const ownerHash = new Bun.CryptoHasher("sha256");
  for await (const bytes of Bun.file(options.owner).stream()) ownerHash.update(bytes);
  const identity = hash(
    JSON.stringify({
      sources,
      proxy: options.proxy,
      owner: options.owner,
      ownerSha256: ownerHash.digest("hex"),
      runtime: Bun.revision,
      producer: hash(await Bun.file(import.meta.path).bytes()),
    }),
  );
  const lock = join(job, "run.lock");
  const recoveredPid = await claimRun(lock, identity);
  const processes = new Set<Bun.Subprocess>();
  const abort = () => {
    for (const process of processes) process.kill();
  };
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(options.timeout * 1000)])
    : AbortSignal.timeout(options.timeout * 1000);
  signal.addEventListener("abort", abort, { once: true });
  const databasePath = join(job, "frontier.sqlite");
  const database = new Database(databasePath, { create: true });
  await chmod(databasePath, 0o600);
  const queue = frontier(database, sources, identity);
  let frontierReady = false;
  const journal = async (state: string, url: string, detail: string | null = null) => {
    const path = join(job, "journal.jsonl");
    await appendFile(
      path,
      JSON.stringify({ at: new Date().toISOString(), identity, state, url, detail }) + "\n",
      { mode: 0o600 },
    );
    await chmod(path, 0o600);
  };
  // Origin lanes serialize requests, including robots checks, across all browser workers.
  const lanes = new Map<string, Promise<void>>();
  async function lane<T>(url: string, action: () => Promise<T>): Promise<T> {
    const host = new URL(url).host;
    const before = lanes.get(host) ?? Promise.resolve();
    let release!: () => void;
    const held = new Promise<void>((done) => {
      release = done;
    });
    lanes.set(
      host,
      before.then(() => held),
    );
    await before;
    try {
      signal.throwIfAborted();
      return await action();
    } finally {
      release();
    }
  }
  async function run(args: string[], output: string, cwd: string) {
    signal.throwIfAborted();
    const process = Bun.spawn(args, {
      cwd,
      stdout: Bun.file(output),
      stderr: Bun.file(output + ".stderr"),
      env: { PATH: processEnvPath, LANG: "C.UTF-8" },
    });
    processes.add(process);
    try {
      const code = await process.exited;
      signal.throwIfAborted();
      if (code) throw new Error("Native owner command failed");
    } finally {
      processes.delete(process);
    }
  }
  const processEnvPath = process.env.PATH;
  try {
    const recovered = queue.recoverInterrupted(recoveredPid !== null);
    frontierReady = true;
    for (const url of recovered)
      await journal("interrupted-requeued", url, "Prior owner PID " + recoveredPid + " is absent");
    // Reuse only complete, byte-identical receipts. Interrupted/failed rows stay explicit.
    for (const row of queue.rows()) {
      if (row.state !== "qualified") continue;
      const path = join(job, hash(row.url) + ".json");
      if (
        !(await Bun.file(path).exists()) ||
        hash(await Bun.file(path).bytes()) !== row.receipt_sha
      )
        throw new Error("Qualified frontier receipt changed");
    }
    await Promise.allSettled(
      Array.from({ length: options.concurrency }, async (_slot, worker) => {
        let url: string | undefined;
        while (!signal.aborted && (url = queue.next())) {
          const source = url;
          await lane(source, async () => {
            const directory = join(job, "worker-" + worker);
            await mkdir(directory, { recursive: true, mode: 0o700 });
            await journal("claimed", source);
            let browser: Bun.Subprocess | undefined;
            let connection: Awaited<ReturnType<typeof obscura.connect>> | undefined;
            try {
              // The shared Rust crawler owns robots, crawl-delay, HTTP status and frontier completeness.
              const crawlPath = join(directory, "crawl.json");
              await run(
                [
                  options.owner,
                  "crawl",
                  source,
                  "--max-depth",
                  "0",
                  "--max-pages",
                  "1",
                  "--concurrency",
                  "1",
                  "--delay-ms",
                  "1000",
                  "--timeout",
                  "30",
                  "--proxy",
                  options.proxy,
                  "--format",
                  "json",
                  "--output",
                  crawlPath,
                ],
                join(directory, "crawl.log"),
                directory,
              );
              const crawl = await Bun.file(crawlPath).json();
              const observed = crawl.pages?.find(
                (page: { url: string; status: number }) =>
                  page.url === source && page.status === 200,
              );
              if (!observed || crawl.errors?.length)
                throw new Error("Robots-aware primary crawl incomplete");
              const reservation = Bun.serve({
                hostname: "127.0.0.1",
                port: 0,
                fetch: () => new Response(null, { status: 404 }),
              });
              const port = reservation.port;
              await reservation.stop(true);
              browser = Bun.spawn(
                [
                  options.owner,
                  "launch",
                  "--host",
                  "127.0.0.1",
                  "--port",
                  String(port),
                  "--workers",
                  "1",
                  "--proxy",
                  options.proxy,
                ],
                {
                  cwd: directory,
                  stdout: "pipe",
                  stderr: Bun.file(join(directory, "browser.stderr")),
                  env: { PATH: processEnvPath, LANG: "C.UTF-8" },
                },
              );
              processes.add(browser);
              const reader = (browser.stdout as ReadableStream<Uint8Array>).getReader();
              const ready = await reader.read();
              reader.releaseLock();
              if (!new TextDecoder().decode(ready.value).includes("/devtools/browser"))
                throw new Error("Native browser readiness missing");
              connection = await obscura.connect(`ws://127.0.0.1:${port}/devtools/browser`, {
                timeout: 20000,
                signal,
              });
              const target = await connection.send<{ targetId: string }>("Target.createTarget", {
                url: "about:blank",
              });
              const { sessionId } = await connection.send<{ sessionId: string }>(
                "Target.attachToTarget",
                { targetId: target.targetId, flatten: true },
              );
              await connection.send("Page.enable", {}, sessionId);
              async function dom(address: string) {
                const loaded = new Promise<boolean>((done) => {
                  const off = connection!.on("Page.loadEventFired", (_event, id) => {
                    if (id === sessionId) {
                      off();
                      clearTimeout(timer);
                      done(true);
                    }
                  });
                  const timer = setTimeout(() => {
                    off();
                    done(false);
                  }, 20000);
                });
                await connection!.send("Page.navigate", { url: address }, sessionId);
                if (!(await loaded)) throw new Error("Native page load did not finish");
                const response = await connection!.send<{
                  result?: { value?: string };
                  exceptionDetails?: unknown;
                }>(
                  "Runtime.evaluate",
                  {
                    expression:
                      "JSON.stringify({url:location.href,title:document.title,text:document.body?.innerText.slice(0,100000)})",
                    returnByValue: true,
                  },
                  sessionId,
                );
                if (response.exceptionDetails || !response.result?.value)
                  throw new Error("Native DOM extraction failed");
                return JSON.parse(response.result.value) as {
                  url: string;
                  title: string;
                  text: string;
                };
              }
              const exit = tokyoExit((await dom("https://am.i.mullvad.net/json")).text);
              const page = verifyDom(await dom(source), source);
              const receipt = {
                schema: "shenron-reader-source-receipt/v1",
                identity,
                sourceUrl: source,
                exit,
                page,
                readerComplete: false,
                published: false,
              };
              const path = join(job, hash(source) + ".json");
              await Bun.write(path, JSON.stringify(receipt, null, 2));
              await chmod(path, 0o600);
              queue.complete(source, hash(await Bun.file(path).bytes()));
              await journal("qualified", source);
            } catch (error) {
              queue.fail(source);
              await journal("failed", source, String(error));
            } finally {
              connection?.close();
              browser?.kill();
              if (browser) {
                await browser.exited;
                processes.delete(browser);
              }
            }
          });
        }
      }),
    );
    for (const url of queue.finishStoppedRun())
      await journal("stopped-requeued", url, "All owned browser tasks have settled");
    const rows = queue.rows();
    const receipt = {
      schema: "shenron-reader-worker-run/v1",
      identity,
      sources: rows,
      complete: rows.every((row) => row.state === "qualified"),
      published: false,
      publication: "No qualified publisher plan supplied",
    };
    const receiptPath = join(job, "receipt.json");
    await Bun.write(receiptPath, JSON.stringify(receipt, null, 2));
    await chmod(receiptPath, 0o600);
    if (receipt.complete && options.publisher) {
      try {
        await publishQualified(options.publisher);
        receipt.published = true;
        receipt.publication = "Qualified owner plan applied and independently read back";
      } catch (error) {
        receipt.publication = String(error);
        await Bun.write(receiptPath, JSON.stringify(receipt, null, 2));
        throw error;
      }
      await Bun.write(receiptPath, JSON.stringify(receipt, null, 2));
    }
    return receipt;
  } finally {
    signal.removeEventListener("abort", abort);
    abort();
    for (const process of processes) await process.exited;
    // All owned browser tasks have settled; release only this run's unfinished claims.
    if (frontierReady) queue.finishStoppedRun();
    database.close();
    await unlink(join(lock, "owner.json"));
    await rmdir(lock);
  }
}
if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      input: { type: "string" },
      job: { type: "string" },
      owner: { type: "string" },
      proxy: { type: "string" },
      concurrency: { type: "string", default: "3" },
      timeout: { type: "string", default: "300" },
      apply: { type: "boolean", default: false },
      "public-root": { type: "string" },
      target: { type: "string" },
    },
  });
  if (!values.input || !values.job || !values.owner || !isAbsolute(values.owner))
    throw Error("Explicit input, private job and qualified aphrody-web owner are required");
  const sources = sourcePlan(await Bun.file(values.input).json());
  const options = {
    sources,
    job: resolve(values.job ?? ""),
    owner: values.owner,
    proxy: values.proxy ?? "socks5://10.200.1.2:1080",
    concurrency: Number(values.concurrency),
    timeout: Number(values.timeout),
  };
  if (!values.apply)
    console.log(
      JSON.stringify({
        schema: "shenron-reader-worker-plan/v1",
        ...options,
        network: false,
        published: false,
      }),
    );
  else
    (async () => {
      const publisher =
        values["public-root"] && values.target
          ? await installedPublisher(values["public-root"], values.target, options.job)
          : undefined;
      return collect({ ...options, publisher });
    })()
      .then((receipt) => {
        console.log(JSON.stringify(receipt));
        if (!receipt.complete) process.exitCode = 1;
        return receipt;
      })
      .catch(() => {
        console.error("Native source worker failed; inspect private receipts");
        process.exitCode = 1;
      });
}
