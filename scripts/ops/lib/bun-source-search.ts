// SPDX-License-Identifier: Apache-2.0
import { chmod, lstat, realpath, rename } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
export interface SourceSearchConfig {
  queries: string[];
  domains: string[];
  count: number;
  cookieJar: string;
  timeoutMs?: number;
}
export type SearchRunner = (
  args: string[],
  jar: string,
  signal: AbortSignal,
  maxBytes: number,
) => Promise<string>;
const digest = (s: string) => new Bun.CryptoHasher("sha256").update(s).digest("hex");
export function planSourceSearch(config: SourceSearchConfig) {
  if (
    !Array.isArray(config.queries) ||
    config.queries.length < 1 ||
    config.queries.length > 8 ||
    config.queries.some(
      (q) =>
        typeof q !== "string" ||
        !q.trim() ||
        q.length > 512 ||
        [...q].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) ||
        /(?:^|\s)(?:site|inurl):/i.test(q),
    )
  )
    throw Error("Invalid explicit discovery queries");
  if (
    !Array.isArray(config.domains) ||
    config.domains.length < 1 ||
    config.domains.length > 8 ||
    config.domains.some(
      (d) =>
        typeof d !== "string" ||
        d.length > 253 ||
        !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(d),
    )
  )
    throw Error("Invalid discovery domains");
  if (
    !Number.isSafeInteger(config.count) ||
    config.count < 1 ||
    config.count > 20 ||
    !isAbsolute(config.cookieJar) ||
    !Number.isSafeInteger(config.timeoutMs ?? 30000) ||
    (config.timeoutMs ?? 30000) < 1 ||
    (config.timeoutMs ?? 30000) > 120000
  )
    throw Error("Invalid bounded discovery configuration");
  const input = {
    schema: "shenron-source-discovery-input/v1",
    queries: config.queries,
    domains: config.domains,
    count: config.count,
    cookieJar: config.cookieJar,
    timeoutMs: config.timeoutMs ?? 30000,
  };
  return { ...input, sha256: digest(JSON.stringify(input)) };
}
export const nativeSearch: SearchRunner = async (args, jar, signal, maxBytes) => {
  signal.throwIfAborted();
  const child = Bun.spawn([process.execPath, "search", ...args], {
    env: { ...process.env, BUN_BE_BUN: "1", APHRODY_GOOGLE_COOKIES_JSON: jar },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "ignore",
  });
  const stop = () => child.kill("SIGINT");
  signal.addEventListener("abort", stop, { once: true });
  const escalation = () => setTimeout(() => child.kill("SIGKILL"), 1000);
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  const abort = () => {
    killTimer = escalation();
  };
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) {
    stop();
    abort();
  }
  try {
    let bytes = 0;
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    for await (const chunk of child.stdout) {
      bytes += chunk.byteLength;
      if (bytes > maxBytes) {
        child.kill("SIGKILL");
        throw Error("Discovery output limit exceeded");
      }
      chunks.push(new Uint8Array(chunk));
    }
    const code = await child.exited;
    signal.throwIfAborted();
    if (code !== 0) throw Error("Native Search failed");
    return await new Blob(chunks).text();
  } finally {
    signal.removeEventListener("abort", stop);
    signal.removeEventListener("abort", abort);
    if (killTimer) clearTimeout(killTimer);
    child.kill();
    await child.exited;
  }
};
export async function collectSourceSearch(
  config: SourceSearchConfig,
  job: string,
  signal?: AbortSignal,
  run: SearchRunner = nativeSearch,
) {
  signal?.throwIfAborted();
  const plan = planSourceSearch(config),
    info = await lstat(config.cookieJar);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.mode & 0o077 ||
    info.size > 4 * 1024 * 1024 ||
    (await realpath(config.cookieJar)) !== resolve(config.cookieJar)
  )
    throw Error("Search requires canonical private cookie jar");
  const validateOrganic = (organic: any) => {
    if (!Array.isArray(organic) || organic.length > config.count)
      throw Error("Invalid discovery organic results");
    return organic.map((r: any) => {
      const url = new URL(r.url);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        !config.domains.some((d) => url.hostname === d || url.hostname.endsWith("." + d)) ||
        !Number.isSafeInteger(r.position) ||
        r.position < 1 ||
        r.position > 1000 ||
        typeof r.title !== "string" ||
        r.title.length > 4096 ||
        typeof r.snippet !== "string" ||
        r.snippet.length > 16384
      )
        throw Error("Discovery result outside explicit scope");
      return { position: r.position, title: r.title, url: url.href, snippet: r.snippet };
    });
  };
  const path = join(job, "discovery-" + plan.sha256 + ".json");
  if (await Bun.file(path).exists()) {
    const savedInfo = await lstat(path);
    if (
      !savedInfo.isFile() ||
      savedInfo.isSymbolicLink() ||
      savedInfo.mode & 0o077 ||
      savedInfo.size > 2 * 1024 * 1024
    )
      throw Error("Discovery receipt must be bounded and private");
    const saved = await Bun.file(path).json();
    if (
      saved.inputSha256 !== plan.sha256 ||
      saved.schema !== "shenron-source-discovery/v1" ||
      !Array.isArray(saved.results) ||
      saved.results.length !== config.queries.length ||
      saved.discoveryOnly !== true
    )
      throw Error("Discovery receipt differs");
    for (const [index, result] of saved.results.entries()) {
      if (result.query !== config.queries[index] || typeof result.servedFromCache !== "boolean")
        throw Error("Discovery receipt query differs");
      validateOrganic(result.organic);
    }
    return {
      inputSha256: plan.sha256,
      receiptSha256: digest(await Bun.file(path).text()),
      queries: saved.results.length,
      resumed: true,
    };
  }
  const results = [];
  for (const query of config.queries) {
    const scoped = `${query} (${config.domains.map((d) => "site:" + d).join(" OR ")})`;
    const bounded = AbortSignal.any([
      ...(signal ? [signal] : []),
      AbortSignal.timeout(plan.timeoutMs),
    ]);
    const raw = await run(
      [
        "--json",
        "--num",
        String(config.count),
        "--timeout-ms",
        String(plan.timeoutMs),
        "--",
        scoped,
      ],
      config.cookieJar,
      bounded,
      256 * 1024,
    );
    if (new TextEncoder().encode(raw).byteLength > 256 * 1024)
      throw Error("Discovery output limit exceeded");
    const value = JSON.parse(raw);
    if (
      value.query !== scoped ||
      value.authenticated !== true ||
      value.transport !== "fetch" ||
      typeof value.servedFromCache !== "boolean" ||
      !Array.isArray(value.organic) ||
      value.organic.length > config.count
    )
      throw Error("Invalid native Search response");
    const organic = validateOrganic(value.organic);
    results.push({ query, servedFromCache: value.servedFromCache, organic });
  }
  signal?.throwIfAborted();
  const body =
    JSON.stringify({
      schema: "shenron-source-discovery/v1",
      inputSha256: plan.sha256,
      discoveryOnly: true,
      results,
    }) + "\n";
  const temporary = path + "." + crypto.randomUUID() + ".tmp";
  await Bun.write(temporary, body);
  await chmod(temporary, 0o600);
  await rename(temporary, path);
  return {
    inputSha256: plan.sha256,
    receiptSha256: digest(body),
    queries: results.length,
    resumed: false,
  };
}
