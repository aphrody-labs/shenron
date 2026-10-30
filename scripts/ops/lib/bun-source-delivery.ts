// SPDX-License-Identifier: Apache-2.0
import { AphrodyComputeClient } from "@aphrody/shenron-pipeline/aphrody/compute";
import {
  crawlIngestPolicySchema,
  nativeDocumentSchema,
  projectNativeCrawl,
  readNativeCrawlDocuments,
} from "@aphrody/shenron-pipeline/dragon-ball/crawl-ingest";

export interface SourceDeliveryConfig {
  rag?: {
    productOrigin: string;
    probeQuery: string;
    expectedSourceUrl: string;
    requireVectors?: boolean;
  };
  deployment?: { release: string; manifestSha256: string; probeUrl: string; probeSha256: string };
  timeoutMs?: number;
}
export interface SourceDeliveryPlan {
  configDigest: string;
  ownerPlanDigest?: string;
  releaseManifestSha256?: string;
}
export interface SourceDeliveryReceipt {
  complete: true;
  ragDocuments: number;
  productRetrievalVerified: boolean;
  deployed: boolean;
  canonicalPromotions: 0;
  trainingEnabled: false;
}
export interface SourceDeliveryPorts {
  signal?: AbortSignal;
  run?: (args: string[], controls: { signal?: AbortSignal; timeoutMs: number }) => Promise<string>;
  compute?: Pick<AphrodyComputeClient, "ragIngest">;
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}
const digest = (value: string | Uint8Array) =>
  new Bun.CryptoHasher("sha256").update(value).digest("hex");
const adapter = "/usr/local/sbin/aphrody-infra-deploy-shenron";
function validate(config: SourceDeliveryConfig) {
  if (!config.rag && !config.deployment) throw new Error("An explicit delivery stage is required");
  const timeout = config.timeoutMs ?? 300000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 1800000)
    throw new Error("Invalid delivery deadline");
  if (config.deployment) {
    const d = config.deployment;
    if (
      !/^\/(?:home\/ubuntu\/apps|srv)\/shenron\/releases\/docker-[a-f0-9]{40}$/.test(d.release) ||
      !/^[a-f0-9]{64}$/.test(d.manifestSha256) ||
      !/^[a-f0-9]{64}$/.test(d.probeSha256)
    )
      throw new Error("Sealed deployment identity required");
    publicUrl(d.probeUrl);
  }
  if (config.rag) {
    const origin = publicUrl(config.rag.productOrigin);
    if (
      origin.origin !== config.rag.productOrigin ||
      !config.rag.probeQuery.trim() ||
      config.rag.probeQuery.length > 500
    )
      throw new Error("Explicit product retrieval probe required");
    publicUrl(config.rag.expectedSourceUrl);
  }
  return timeout;
}
function publicUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.hash)
    throw new Error("Public HTTPS delivery URL required");
  return url;
}
async function boundedBody(response: Response, max = 2 * 1024 * 1024) {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) throw new Error("Delivery response exceeds bound");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return body;
}
/** Fixed owner executable; command arguments never pass through a local shell. */
export async function runDeliveryOwner(
  args: string[],
  controls: { signal?: AbortSignal; timeoutMs: number },
) {
  controls.signal?.throwIfAborted();
  const process = Bun.spawn(["aphrody", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...Bun.env,
      APHRODY_SSH_COMMAND_TIMEOUT_SECS: String(
        Math.min(86400, Math.max(1, Math.ceil(controls.timeoutMs / 1000))),
      ),
    },
  });
  const readers = new Set<ReadableStreamDefaultReader<Uint8Array>>();
  let stopped = false;
  const stop = () => {
    stopped = true;
    process.kill("SIGKILL");
    for (const reader of readers) void reader.cancel().catch(() => {});
  };
  const deadline = setTimeout(stop, controls.timeoutMs);
  controls.signal?.addEventListener("abort", stop, { once: true });
  let bytes = 0;
  const read = async (stream: ReadableStream<Uint8Array>, retain: boolean) => {
    const reader = stream.getReader();
    readers.add(reader);
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length;
        if (bytes > 65536) {
          stop();
          throw new Error("Delivery owner output exceeds bound");
        }
        if (retain) chunks.push(value);
      }
      return retain ? new TextDecoder().decode(Buffer.concat(chunks)) : "";
    } finally {
      readers.delete(reader);
      reader.releaseLock();
    }
  };
  try {
    const results = await Promise.allSettled([
      read(process.stdout, true),
      read(process.stderr, false),
      process.exited,
    ]);
    controls.signal?.throwIfAborted();
    const [out, err, code] = results;
    if (
      stopped ||
      out.status !== "fulfilled" ||
      err.status !== "fulfilled" ||
      code.status !== "fulfilled" ||
      code.value !== 0
    )
      throw new Error("Canonical delivery owner failed");
    return out.value;
  } finally {
    clearTimeout(deadline);
    controls.signal?.removeEventListener("abort", stop);
  }
}
function deploymentArgs(release: string) {
  return ["infra", "deploy", "--target", "dbfr", "--stack", "shenron", "--release", release];
}
export async function prepareDelivery(
  config: SourceDeliveryConfig,
  signal?: AbortSignal,
  ports: SourceDeliveryPorts = {},
): Promise<SourceDeliveryPlan> {
  const timeoutMs = validate(config);
  signal ??= ports.signal;
  signal?.throwIfAborted();
  const plan: SourceDeliveryPlan = { configDigest: digest(JSON.stringify(config)) };
  if (config.deployment) {
    const run = ports.run ?? runDeliveryOwner;
    const d = config.deployment;
    const hash = await run(
      ["infra", "ssh", "exec", "--host", "dbfr", "--", "sha256sum", d.release + "/release.json"],
      { signal, timeoutMs },
    );
    if (hash.trim().split(/\s+/)[0] !== d.manifestSha256)
      throw new Error("Remote sealed release changed");
    await run(
      ["infra", "ssh", "exec", "--host", "dbfr", "--", "sudo", "-n", adapter, "verify", d.release],
      { signal, timeoutMs },
    );
    plan.ownerPlanDigest = digest(await run(deploymentArgs(d.release), { signal, timeoutMs }));
    plan.releaseManifestSha256 = d.manifestSha256;
  }
  return plan;
}
export async function deliver(
  config: SourceDeliveryConfig,
  context: {
    input: string;
    policy: unknown;
    plan: SourceDeliveryPlan;
    databaseVerified: boolean;
    cdnVerified: boolean;
    ragEligibleUrls?: string[];
    verifyOnly?: boolean;
    receipt?: SourceDeliveryReceipt;
  },
  ports: SourceDeliveryPorts = {},
): Promise<SourceDeliveryReceipt> {
  const timeoutMs = validate(config);
  if (!context.databaseVerified || !context.cdnVerified)
    throw new Error("Database and CDN verification must precede delivery");
  if (context.plan.configDigest !== digest(JSON.stringify(config)))
    throw new Error("Delivery plan changed");
  if (
    context.verifyOnly &&
    (!context.receipt?.complete ||
      context.receipt.canonicalPromotions !== 0 ||
      context.receipt.trainingEnabled !== false ||
      (config.rag && !context.receipt.productRetrievalVerified) ||
      (config.deployment && !context.receipt.deployed))
  )
    throw new Error("A completed delivery receipt is required for verification");
  const signal = ports.signal
    ? AbortSignal.any([ports.signal, AbortSignal.timeout(timeoutMs)])
    : AbortSignal.timeout(timeoutMs);
  signal.throwIfAborted();
  const fetcher = ports.fetcher ?? fetch;
  const boundedFetch: typeof fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestSignal = input instanceof Request ? input.signal : undefined;
      const signals = [signal, init?.signal, requestSignal].filter(
        (item): item is AbortSignal => !!item,
      );
      const response = await fetcher(input, {
        ...init,
        signal: AbortSignal.any(signals),
        redirect: "error",
      });
      return new Response(await boundedBody(response), {
        status: response.status,
        headers: response.headers,
      });
    },
    { preconnect: fetch.preconnect },
  );
  let ragDocuments = 0;
  let productRetrievalVerified = false;
  let retrievalProbe: (() => Promise<void>) | undefined;
  if (config.rag) {
    const policy = crawlIngestPolicySchema.parse(context.policy);
    if (!context.ragEligibleUrls)
      throw new Error("Registry readback must identify eligible RAG sources");
    const eligible = new Set(context.ragEligibleUrls);
    const compute = context.verifyOnly
      ? undefined
      : (ports.compute ?? new AphrodyComputeClient({ fetcher: boundedFetch }));
    let probeSourceId: string | undefined;
    let probePresent = false;
    // Validate the complete export before the first RAG mutation.
    for await (const value of readNativeCrawlDocuments(context.input, signal)) {
      const document = nativeDocumentSchema.parse(value);
      const record = projectNativeCrawl(document, policy)[0];
      if (record && eligible.has(record.url)) {
        const source = policy.sources.find(
          (candidate) => candidate.domain === document.source_domain,
        );
        if (!source?.rights.ragPermitted)
          throw new Error("Reviewed RAG rights are required for each eligible corpus source");
        if (Buffer.byteLength(document.payload.body_markdown) > 512 * 1024)
          throw new Error("RAG source exceeds owner content bound");
        if (record.url === config.rag.expectedSourceUrl) probePresent = true;
      }
      if (++ragDocuments > 100000) throw new Error("RAG document budget exceeded");
    }
    if (!probePresent) throw new Error("Expected RAG probe source absent");
    ragDocuments = 0;
    for await (const value of readNativeCrawlDocuments(context.input, signal)) {
      const document = nativeDocumentSchema.parse(value);
      const record = projectNativeCrawl(document, policy)[0];
      if (!record || !eligible.has(record.url)) continue;
      const sourceId = `shenron:pg:native_crawl:${digest(record.url).slice(0, 24)}:0`;
      if (compute) {
        const result = await compute.ragIngest({
          sourceId,
          originSourceId: sourceId,
          url: record.url,
          title: record.title,
          content: document.payload.body_markdown.replaceAll("\0", "").trim(),
          kind: record.kind,
        });
        if (
          !result.indexed ||
          result.sourceId !== sourceId ||
          (config.rag.requireVectors !== false && !result.vectorIndexed)
        )
          throw new Error("RAG owner did not confirm indexing");
      }
      ragDocuments++;
      if (record.url === config.rag.expectedSourceUrl) probeSourceId = sourceId;
    }
    if (!ragDocuments || !probeSourceId) throw new Error("Expected RAG probe source absent");
    const url = new URL("/api/public/rag/search", config.rag.productOrigin);
    url.search = new URLSearchParams({
      q: config.rag.probeQuery,
      sourceId: probeSourceId,
      limit: "25",
    }).toString();
    retrievalProbe = async () => {
      const response = await boundedFetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error("Product RAG probe failed");
      const result: unknown = await response.json();
      if (
        !result ||
        typeof result !== "object" ||
        !("results" in result) ||
        !Array.isArray(result.results) ||
        !result.results.some(
          (hit) =>
            hit && hit.sourceId === probeSourceId && hit.url === config.rag!.expectedSourceUrl,
        )
      )
        throw new Error("Product retriever did not return indexed source");
    };
    await retrievalProbe();
    productRetrievalVerified = true;
  }
  let deployed = false;
  if (config.deployment) {
    const fresh = await prepareDelivery(config, signal, ports);
    if (
      fresh.ownerPlanDigest !== context.plan.ownerPlanDigest ||
      fresh.releaseManifestSha256 !== context.plan.releaseManifestSha256
    )
      throw new Error("Deployment preflight changed");
    const run = ports.run ?? runDeliveryOwner;
    let output = "";
    if (!context.verifyOnly) {
      try {
        output = await run([...deploymentArgs(config.deployment.release), "--apply"], {
          signal,
          timeoutMs,
        });
      } catch {
        throw Object.assign(
          new Error("Deployment state is uncertain; qualify remote owner state before retry"),
          { code: "ERR_DELIVERY_STATE_UNCERTAIN" },
        );
      }
    }
    const backup = output.match(
      /rollback=(\/(?:home\/ubuntu\/apps|srv)\/shenron\/deploy-backups\/docker-[A-Za-z0-9_-]+)/,
    )?.[1];
    try {
      const root = config.deployment.release.split("/releases/")[0];
      const active = await run(
        ["infra", "ssh", "exec", "--host", "dbfr", "--", "readlink", "-f", root + "/current"],
        { signal, timeoutMs },
      );
      if (active.trim() !== config.deployment.release)
        throw new Error("Active deployment identity differs");
      const response = await boundedFetch(config.deployment.probeUrl, { cache: "no-store" });
      if (!response.ok || digest(await response.bytes()) !== config.deployment.probeSha256)
        throw new Error("Deployed public artifact probe differs");
      await retrievalProbe?.();
      deployed = true;
    } catch {
      if (context.verifyOnly) throw new Error("Current deployment verification failed");
      if (!backup) throw new Error("Deployment probe failed; owner rollback receipt unavailable");
      await run(
        ["infra", "ssh", "exec", "--host", "dbfr", "--", "sudo", "-n", adapter, "restore", backup],
        { timeoutMs },
      );
      throw new Error("Deployment probe failed; owner rollback completed");
    }
  }
  if (context.verifyOnly && context.receipt!.ragDocuments !== ragDocuments)
    throw new Error("RAG receipt cardinality changed");
  return {
    complete: true,
    ragDocuments,
    productRetrievalVerified,
    deployed,
    canonicalPromotions: 0,
    trainingEnabled: false,
  };
}
