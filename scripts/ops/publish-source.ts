// SPDX-License-Identifier: Apache-2.0
import { Database } from "bun:sqlite";
import { chmod, mkdir, lstat } from "node:fs/promises";
import { join, resolve, isAbsolute } from "node:path";
import { parseArgs } from "node:util";
import postgres from "postgres";
import { DEFAULT_PUBLIC_ORIGINS } from "@aphrody/shenron-config/public-urls";
import {
  ingestNativeCrawl,
  createPostgresCrawlRegistry,
  projectNativeCrawl,
  crawlIngestPolicySchema,
  type CrawlRegistryPort,
} from "../../packages/pipeline/src/dragon-ball/crawl-ingest";

export const digest = (body: string | Uint8Array) =>
  new Bun.CryptoHasher("sha256").update(body).digest("hex");
type ReviewedInput = {
  schema: "shenron-reviewed-transcription/v1";
  sourceUrl: string;
  targetUrl: string;
  reviewed: true;
  method: "direct_visual_transcription";
  language: "ja";
  title: string;
  text: string;
  textSha256: string;
  sourceImages: { url: string; sha256: string }[];
  nativeOcr: { qualified: false; status: "failed" | "not_requested" };
};
function exactKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}
function parseReviewedInput(value: unknown): ReviewedInput {
  if (
    !exactKeys(value, [
      "schema",
      "sourceUrl",
      "targetUrl",
      "reviewed",
      "method",
      "language",
      "title",
      "text",
      "textSha256",
      "sourceImages",
      "nativeOcr",
    ]) ||
    value.schema !== "shenron-reviewed-transcription/v1" ||
    value.reviewed !== true ||
    value.method !== "direct_visual_transcription" ||
    value.language !== "ja" ||
    typeof value.sourceUrl !== "string" ||
    typeof value.targetUrl !== "string" ||
    typeof value.title !== "string" ||
    !value.title.trim() ||
    value.title.length > 1000 ||
    !value.title.isWellFormed() ||
    typeof value.text !== "string" ||
    typeof value.textSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.textSha256) ||
    !Array.isArray(value.sourceImages) ||
    !value.sourceImages.length ||
    value.sourceImages.length > 96 ||
    !value.sourceImages.every(
      (image) =>
        exactKeys(image, ["url", "sha256"]) &&
        typeof image.url === "string" &&
        typeof image.sha256 === "string" &&
        /^[a-f0-9]{64}$/.test(image.sha256),
    ) ||
    !exactKeys(value.nativeOcr, ["qualified", "status"]) ||
    value.nativeOcr.qualified !== false ||
    !["failed", "not_requested"].includes(String(value.nativeOcr.status))
  )
    throw new Error("Invalid reviewed transcription schema");
  return value as unknown as ReviewedInput;
}
export function reviewedTranscription(value: unknown, source: string, target: string) {
  const input = parseReviewedInput(value);
  if (
    input.sourceUrl !== publicSource(source).href ||
    input.targetUrl !== publicationTarget(target).url ||
    !input.text.trim() ||
    !input.text.isWellFormed() ||
    [...input.text].some((character) => {
      const code = character.charCodeAt(0);
      return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
    }) ||
    new TextEncoder().encode(input.text).length > 1024 * 1024 ||
    digest(input.text) !== input.textSha256
  )
    throw new Error("Reviewed transcription identity, UTF-8 text or SHA is invalid");
  const seen = new Set<string>();
  for (const image of input.sourceImages) {
    const url = publicSource(image.url);
    if (
      url.href !== image.url ||
      url.hostname !== new URL(source).hostname ||
      url.href === input.sourceUrl ||
      seen.has(url.href)
    )
      throw new Error("Reviewed images must be unique exact same-host public URLs");
    seen.add(url.href);
  }
  return input;
}
export function reviewedProvenance(
  input: ReturnType<typeof reviewedTranscription>,
  inputSha256: string,
) {
  return {
    schema: input.schema,
    inputSha256,
    reviewed: true,
    method: input.method,
    language: input.language,
    textSha256: input.textSha256,
    sourceImages: input.sourceImages,
    nativeOcr: input.nativeOcr,
    nativeCaptureSeparate: true,
    ragPermitted: false,
    trainingPermitted: false,
    canonicalEligible: false,
  };
}
export function verifyReviewedImage(
  url: string,
  sha256: string,
  input: ReturnType<typeof reviewedTranscription>,
  bytes?: Uint8Array,
  mime?: string,
) {
  if (input.sourceImages.find((image) => image.url === url)?.sha256 !== sha256)
    throw new Error("Reviewed image fresh bytes differ from pinned SHA");
  if (
    bytes &&
    (mime !== "image/png" ||
      ![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value))
  )
    throw new Error("Reviewed visual images require actual PNG bytes");
}
async function loadReviewedInput(path: string, sha256: string, source: string, target: string) {
  if (!isAbsolute(path) || !/^[a-f0-9]{64}$/.test(sha256))
    throw new Error("Reviewed input requires absolute private path and SHA");
  const stat = await lstat(path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size > 2 * 1024 * 1024 ||
    (process.platform !== "win32" && stat.mode & 0o077)
  )
    throw new Error("Reviewed input must be a protected regular file <=2 MiB");
  const bytes = await Bun.file(path).bytes();
  if (digest(bytes) !== sha256) throw new Error("Reviewed input SHA differs");
  return reviewedTranscription(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    source,
    target,
  );
}
export function publicationIndexBody(value: unknown) {
  const body = JSON.stringify(value, null, 2) + "\n";
  if (new TextEncoder().encode(body).length > 2 * 1024 * 1024)
    throw new Error("Public index exceeds 2 MiB");
  return body;
}
export function publicationPolicy(sourceUrl: string) {
  const domain = new URL(sourceUrl).hostname;
  return crawlIngestPolicySchema.parse({
    version: 1,
    profile: "dbfr",
    sources: [
      {
        domain,
        kind: domain === "archive.org" ? "archive" : "reference",
        reviewed: true,
        evidence: sourceUrl,
        rights: { ragPermitted: false, trainingPermitted: false, publicImagesPermitted: true },
      },
    ],
  });
}
/** Generic publication adds new identities; existing editorial metadata needs an explicit update owner. */
export function preserveExistingRegistry(
  owner: CrawlRegistryPort,
  identities: ReadonlySet<string>,
): CrawlRegistryPort {
  return {
    assertReady: () => owner.assertReady(),
    upsert: (record) =>
      identities.has(record.url) ? Promise.resolve("protected") : owner.upsert(record),
  };
}
export function publicSource(raw: string): URL {
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(host) ||
    /^\d+(?:\.\d+){3}$/.test(host) ||
    /(?:^|\.)(?:localhost|local|internal|fandom\.com)$/.test(host) ||
    [...raw].some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)
  )
    throw new Error("Source requires a public HTTPS domain without credentials");
  return url;
}
export function publicationTarget(raw: string) {
  const url = new URL(raw);
  const match = /^\/publications\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(url.pathname);
  if (
    url.origin !== DEFAULT_PUBLIC_ORIGINS.site ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !match ||
    match[1]!.length > 80
  )
    throw new Error(`Target must be ${DEFAULT_PUBLIC_ORIGINS.site}/publications/<slug>`);
  return { url: url.href, slug: match[1]! };
}
export function publicAddress(address: string) {
  if (address.includes(":")) return /^[23][0-9a-f]{3}:/i.test(address);
  const octets = address.split(".").map(Number);
  const [a, b] = octets;
  return (
    octets.length === 4 &&
    octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) &&
    a !== 0 &&
    a !== 10 &&
    a !== 127 &&
    a! < 224 &&
    !(a === 169 && b === 254) &&
    !(a === 172 && b! >= 16 && b! <= 31) &&
    !(a === 192 && (b === 168 || b === 0)) &&
    !(a === 100 && b! >= 64 && b! <= 127) &&
    !(a === 198 && (b === 18 || b === 19))
  );
}
async function assertPublicDns(url: URL) {
  const answers = await Bun.dns.lookup(url.hostname);
  if (!answers.length || answers.some(({ address }) => !publicAddress(address)))
    throw new Error("Source DNS includes a protected network address");
}
export function publicationPlan(
  source: string,
  target: string,
  limits = { requests: 256, depth: 5, timeout: 900 },
) {
  const url = publicSource(source);
  const destination = publicationTarget(target);
  if (
    !Number.isSafeInteger(limits.requests) ||
    limits.requests < 1 ||
    limits.requests > 256 ||
    !Number.isSafeInteger(limits.depth) ||
    limits.depth < 0 ||
    limits.depth > 10 ||
    !Number.isSafeInteger(limits.timeout) ||
    limits.timeout < 1 ||
    limits.timeout > 1800
  )
    throw new Error("Publication budgets exceed supported limits");
  return {
    schema: "shenron-source-publication-plan/v1",
    sourceUrl: url.href,
    targetUrl: destination.url,
    slug: destination.slug,
    limits,
    publicPrefix: `/publications/${destination.slug}`,
    canonicalPromotions: 0,
    crawl: [
      "web",
      "crawl",
      url.href,
      "--allowed-domains",
      url.hostname,
      "--max-requests",
      String(limits.requests),
      "--max-depth",
      String(limits.depth),
      "--concurrency",
      "2",
      "--max-per-host",
      "2",
      "--per-host-delay",
      "1000",
      "--obey-robots",
      ...(limits.depth > 0 ? ["--sitemaps"] : []),
      "--json",
    ],
    requires: ["qualified Bun 1.4.4", "private job", "DBFR registry", "CDN publication owner"],
  };
}
type Page = {
  url: string;
  title: string;
  markdown: string;
  content_hash: string;
  fetched_at: number;
};
export function reviewedPublicationPages(
  pages: Page[],
  input: ReturnType<typeof reviewedTranscription>,
) {
  if (pages.length !== 1 || pages[0]!.url !== input.sourceUrl)
    throw new Error("Reviewed body requires the independent exact native seed");
  return [{ ...pages[0]!, title: input.title, markdown: input.text }];
}
export function nativePageExport(page: Page, sourceUrl: string) {
  return {
    crawl_id: digest(sourceUrl),
    document_uid: digest(page.url),
    canonical_url: page.url,
    source_domain: new URL(page.url).hostname,
    category: "public-source",
    http_status: 200,
    raw_checksum: digest(page.markdown),
    timestamp_utc: new Date(page.fetched_at).toISOString(),
    payload: {
      title_raw: page.title.slice(0, 1000),
      body_markdown: page.markdown,
      public_excerpt: page.markdown
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 8000),
      embedded_media: [],
    },
  };
}
export function projectPage(page: Page, prefix: string, allowedHost: string) {
  if (
    publicSource(page.url).hostname !== allowedHost ||
    !page.markdown.trim() ||
    new TextEncoder().encode(page.markdown).length > 1024 * 1024
  )
    throw new Error("Frontier page is outside the bounded source scope");
  const sha256 = digest(page.markdown);
  const children = [
    ...new Set(
      [...page.markdown.matchAll(/!?\[[^\]]*\]\((https:\/\/[^\s)]+)\)/g)].flatMap((match) => {
        try {
          const url = publicSource(match[1]!);
          return url.hostname === allowedHost ? [url.href] : [];
        } catch {
          return [];
        }
      }),
    ),
  ].toSorted();
  return {
    sourceUrl: page.url,
    title: page.title.slice(0, 1000),
    body: {
      path: `${prefix}/objects/${sha256}.md`,
      sha256,
      size: new TextEncoder().encode(page.markdown).length,
    },
    media: [] as { path: string; mime: string; size: number; sha256: string }[],
    children,
  };
}
async function privateWrite(path: string, value: unknown) {
  await Bun.write(path, typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n");
  await chmod(path, 0o600);
}
async function run() {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    strict: true,
    options: {
      source: { type: "string" },
      target: { type: "string" },
      job: { type: "string" },
      apply: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      "reviewed-input": { type: "string" },
      "reviewed-sha256": { type: "string" },
      "plan-sha256": { type: "string" },
      "max-requests": { type: "string", default: "256" },
      "max-depth": { type: "string", default: "5" },
      timeout: { type: "string", default: "900" },
    },
  });
  if (values.help) {
    console.log(
      `Usage: bun scripts/ops/publish-source.ts --source <public HTTPS URL> --target ${DEFAULT_PUBLIC_ORIGINS.site}/publications/<slug> [--job <absolute private directory>] [--apply]\nBudgets: --max-requests 1..256 (256), --max-depth 0..10 (5), --timeout 1..1800 (900 seconds).\nReviewed visual input: --reviewed-input <private JSON> --reviewed-sha256 <SHA256>, requests1/depth0; apply additionally requires --plan-sha256 <physical plan SHA256>.\nPlan pins plan.json in --job; --apply requires the identical plan and configured protected DBFR/CDN owners.\nThe dynamic /publications routes require an initial qualified site deployment. Subsequent source publications reuse those routes without another Next build.`,
    );
    return;
  }
  if (!values.source || !values.target)
    throw new Error(
      "Usage: publish-source --source <public URL> --target https://dragonballfr.com/publications/<slug> [--job <private directory>] [--apply]",
    );
  const basePlan = publicationPlan(values.source, values.target, {
    requests: Number(values["max-requests"]),
    depth: Number(values["max-depth"]),
    timeout: Number(values.timeout),
  });
  if (!!values["reviewed-input"] !== !!values["reviewed-sha256"])
    throw new Error("Reviewed input and SHA must be supplied together");
  const reviewed = values["reviewed-input"]
    ? await loadReviewedInput(
        values["reviewed-input"],
        values["reviewed-sha256"]!,
        basePlan.sourceUrl,
        basePlan.targetUrl,
      )
    : undefined;
  if (reviewed && (basePlan.limits.requests !== 1 || basePlan.limits.depth !== 0))
    throw new Error("Reviewed transcription requires independent single-page depth-zero crawl");
  const plan = {
    ...basePlan,
    ...(reviewed
      ? {
          reviewedInput: {
            path: resolve(values["reviewed-input"]!),
            sha256: values["reviewed-sha256"]!,
            provenance: reviewedProvenance(reviewed, values["reviewed-sha256"]!),
          },
        }
      : {}),
  };
  if (!values.apply) {
    if (values.job) {
      if (!isAbsolute(values.job)) throw new Error("Job requires an absolute directory");
      await mkdir(values.job, { recursive: true, mode: 0o700 });
      if (await Bun.file(join(values.job, "plan.json")).exists())
        throw new Error("Plan already exists");
      await privateWrite(join(values.job, "plan.json"), plan);
    }
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  if (
    !Bun.version.startsWith("1.4.4") ||
    !values.job ||
    !isAbsolute(values.job) ||
    !process.env.DATABASE_URL
  )
    throw new Error(
      "Apply requires native Bun 1.4.4, --job absolute private directory and protected DBFR environment",
    );
  const root = resolve(values.job);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const stat = await lstat(root);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    (process.platform !== "win32" && stat.mode & 0o077)
  )
    throw new Error("Job must be a protected regular directory");
  if (!Bun.deepEquals(await Bun.file(join(root, "plan.json")).json(), plan))
    throw new Error("Apply differs from the pinned plan");
  if (
    (reviewed || values["plan-sha256"]) &&
    digest(await Bun.file(join(root, "plan.json")).bytes()) !== values["plan-sha256"]
  )
    throw new Error("Apply requires exact reviewed plan SHA");
  if (await Bun.file(join(root, "crawl.json")).exists())
    throw new Error("Apply already started; inspect receipts before retrying");
  await assertPublicDns(new URL(plan.sourceUrl));
  const signal = AbortSignal.timeout(plan.limits.timeout * 1000);
  const output = Bun.file(join(root, "crawl.json"));
  const child = Bun.spawn(
    [
      process.env.APHRODY_CLI ?? "aphrody",
      ...plan.crawl,
      "--sqlite",
      join(root, "frontier.sqlite"),
    ],
    { stdout: output, stderr: Bun.file(join(root, "crawl.stderr.log")), signal },
  );
  if ((await child.exited) !== 0) throw new Error("Native crawl failed; inspect private logs");
  const crawl = await output.json();
  if (
    !Array.isArray(crawl.pages) ||
    !crawl.frontier ||
    !["pending", "locked", "done", "failed"].every(
      (key) => Number.isSafeInteger(crawl.frontier[key]) && crawl.frontier[key] >= 0,
    ) ||
    !Array.isArray(crawl.errors) ||
    crawl.errors.length ||
    crawl.frontier?.pending ||
    crawl.frontier?.locked ||
    crawl.frontier?.failed
  )
    throw new Error("Crawl incomplete: no partial publication is labelled complete");
  const frontier = new Database(join(root, "frontier.sqlite"), { readonly: true });
  let pages: Page[];
  try {
    pages = frontier
      .query<Page, [number]>(
        "SELECT url,title,markdown,content_hash,fetched_at FROM pages ORDER BY url LIMIT ?",
      )
      .all(plan.limits.requests + 1);
  } finally {
    frontier.close();
  }
  if (!pages.length || pages.length > plan.limits.requests)
    throw new Error("Frontier cardinality exceeds the plan");
  if (!pages.some((page) => page.url === plan.sourceUrl))
    throw new Error(
      "Exact seed was not retained by the native frontier; select its canonical public URL explicitly",
    );
  const statuses = new Map<string, number>(
    crawl.pages.map((page: { url: string; status: number }) => [page.url, page.status]),
  );
  if (
    pages.some(
      (page) =>
        !Number.isInteger(statuses.get(page.url)) ||
        statuses.get(page.url)! < 200 ||
        statuses.get(page.url)! >= 300,
    )
  )
    throw new Error("Frontier page lacks a successful native response in this crawl");
  if (reviewed && (pages.length !== 1 || statuses.get(plan.sourceUrl) !== 200))
    throw new Error("Reviewed transcription requires exactly one native HTTP200 seed proof");
  // Native captures remain untouched; the reviewed body is a separately attributed publication input.
  const publicationPages = reviewed ? reviewedPublicationPages(pages, reviewed) : pages;
  const nativeExports = pages.map((page) => nativePageExport(page, plan.sourceUrl));
  const nativeExportBody =
    nativeExports.map((document) => JSON.stringify(document)).join("\n") + "\n";
  const provenance = reviewed
    ? {
        ...reviewedProvenance(reviewed, values["reviewed-sha256"]!),
        nativeCapture: {
          sourceUrl: plan.sourceUrl,
          httpStatus: 200,
          sourceCaptureSha256: digest(nativeExportBody),
          captureFormat: "native-export.jsonl",
        },
      }
    : undefined;
  const publicRoot = join(root, "public");
  const objects = join(publicRoot, "publications", plan.slug, "objects");
  await mkdir(objects, { recursive: true, mode: 0o700 });
  const documents = publicationPages.map((page) =>
    projectPage(page, plan.publicPrefix, new URL(plan.sourceUrl).hostname),
  );
  const identities = new Set(pages.map((page) => page.url));
  for (const document of documents)
    document.children = document.children.filter((url) => identities.has(url));
  for (let i = 0; i < pages.length; i++)
    await privateWrite(
      join(objects, `${documents[i]!.body.sha256}.md`),
      publicationPages[i]!.markdown,
    );
  let mediaBytes = 0;
  const acquired = new Map<string, { path: string; mime: string; size: number; sha256: string }>();
  for (let i = 0; i < pages.length; i++) {
    const imageUrls = reviewed
      ? reviewed.sourceImages.map((image) => image.url)
      : [...pages[i]!.markdown.matchAll(/!\[[^\]]*\]\((https:\/\/[^\s)]+)\)/g)].map(
          (match) => match[1]!,
        );
    for (const imageUrl of imageUrls) {
      const url = publicSource(imageUrl);
      if (url.hostname !== new URL(plan.sourceUrl).hostname) continue;
      let media = acquired.get(url.href);
      if (!media) {
        if (acquired.size >= 96)
          throw new Error("Image acquisition exceeds 96 objects; publication is incomplete");
        await assertPublicDns(url);
        const response = await fetch(url, {
          redirect: "error",
          signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
        });
        const mime = response.headers.get("content-type")?.split(";")[0]?.toLowerCase();
        if (
          !response.ok ||
          (reviewed && response.status !== 200) ||
          !["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"].includes(
            mime ?? "",
          ) ||
          !response.body
        )
          throw new Error("An authorized image could not be independently acquired");
        const chunks: Uint8Array[] = [];
        let size = 0;
        for await (const chunk of response.body) {
          size += chunk.length;
          if (size > 16 * 1024 * 1024 || mediaBytes + size > 128 * 1024 * 1024)
            throw new Error("Image byte budget exceeded");
          chunks.push(chunk);
        }
        if (!size) throw new Error("Empty media object");
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        const sha256 = digest(bytes);
        if (reviewed) verifyReviewedImage(url.href, sha256, reviewed, bytes, mime);
        const extension = {
          "image/jpeg": "jpg",
          "image/png": "png",
          "image/webp": "webp",
          "image/gif": "gif",
          "image/avif": "avif",
        }[mime!]!;
        const filename = `${sha256}.${extension}`;
        await Bun.write(join(objects, filename), bytes);
        await chmod(join(objects, filename), 0o600);
        media = { path: `${plan.publicPrefix}/objects/${filename}`, mime: mime!, size, sha256 };
        acquired.set(url.href, media);
        mediaBytes += size;
      }
      if (!documents[i]!.media.some((entry) => entry.path === media!.path))
        documents[i]!.media.push(media);
    }
  }
  const publication = {
    schema: "shenron-source-publication/v1",
    sourceUrl: plan.sourceUrl,
    targetUrl: plan.targetUrl,
    publishedAt: new Date().toISOString(),
    title: (
      publicationPages.find((page) => page.url === plan.sourceUrl) ?? publicationPages[0]!
    ).title.slice(0, 1000),
    documents,
    ...(reviewed ? { provenance } : {}),
  };
  const indexBody = publicationIndexBody(publication);
  await privateWrite(join(publicRoot, "publications", plan.slug, "index.json"), indexBody);
  const policy = publicationPolicy(plan.sourceUrl);
  const exports = reviewed
    ? publicationPages.map((page) =>
        Object.assign(nativePageExport(page, plan.sourceUrl), {
          category: "reviewed-visual-transcription",
          provenance,
        }),
      )
    : nativeExports;
  const enrichReviewed = (record: ReturnType<typeof projectNativeCrawl>[number]) =>
    reviewed
      ? { ...record, provenance: { ...record.provenance, reviewedPublication: provenance } }
      : record;
  const expectedRecords = exports.flatMap((document) =>
    projectNativeCrawl(document, crawlIngestPolicySchema.parse(policy)).map(enrichReviewed),
  );
  await privateWrite(join(root, "native-export.jsonl"), nativeExportBody);
  const inputPath = join(root, reviewed ? "reviewed-export.jsonl" : "native-export.jsonl");
  if (reviewed)
    await privateWrite(
      inputPath,
      exports.map((document) => JSON.stringify(document)).join("\n") + "\n",
    );
  // The capability owner owns R2 credentials, uploads, index activation and independent byte verification.
  const modulePath = process.env.SHENRON_SOURCE_CDN_MODULE;
  if (!modulePath || !isAbsolute(modulePath))
    throw new Error("Configured installed CDN publication owner module is required");
  const owner = await import(modulePath);
  if (typeof owner.publishCatalog !== "function")
    throw new Error("CDN owner must expose publishCatalog");
  const configPath = process.env.SHENRON_SOURCE_CDN_CONFIG;
  if (!configPath || !isAbsolute(configPath))
    throw new Error("Protected CDN owner configuration is required");
  const configStat = await lstat(configPath);
  if (
    !configStat.isFile() ||
    configStat.isSymbolicLink() ||
    (process.platform !== "win32" && configStat.mode & 0o077)
  )
    throw new Error("CDN configuration must be a protected regular file");
  const config = await Bun.file(configPath).json();
  if (typeof config.stateDirectory !== "string" || !isAbsolute(config.stateDirectory))
    throw new Error("CDN owner requires an absolute protected state directory");
  const statePath = join(config.stateDirectory, "current-inventory.json");
  if (await Bun.file(statePath).exists()) {
    const stateInfo = await lstat(statePath);
    if (
      !stateInfo.isFile() ||
      stateInfo.isSymbolicLink() ||
      (process.platform !== "win32" && stateInfo.mode & 0o077)
    )
      throw new Error("CDN current inventory state is not protected");
    const state = await Bun.file(statePath).json();
    if (
      !isAbsolute(state.inventoryPath ?? "") ||
      !/^[a-f0-9]{64}$/.test(state.inventorySha256 ?? "") ||
      typeof state.prefix !== "string" ||
      typeof state.deploymentId !== "string" ||
      !/^[a-f0-9]{64}$/.test(state.codeSha256 ?? "")
    )
      throw new Error("CDN current inventory state is unqualified");
    Object.assign(config, {
      previousInventory: state.inventoryPath,
      previousInventorySha256: state.inventorySha256,
      expectedPrefix: state.prefix,
      expectedDeployment: state.deploymentId,
      expectedCodeSha256: state.codeSha256,
    });
  }
  const sql = postgres(process.env.DATABASE_URL, {
    max: 1,
    prepare: false,
    connection: { statement_timeout: 30000 },
  });
  try {
    await sql`SELECT pg_advisory_lock(hashtext('shenron-source-publication'))`;
    const registry = createPostgresCrawlRegistry(sql);
    await registry.assertReady();
    const urls = pages.map((page) => page.url);
    const snapshot = () => sql`SELECT r.*, p.provenance, p.updated_at AS provenance_updated_at
      FROM public.external_source_records r LEFT JOIN public.external_source_provenance p USING(url)
      WHERE r.url IN ${sql(urls)} ORDER BY r.url`;
    const before = await snapshot();
    await privateWrite(join(root, "registry-before.json"), before);
    const cdnOptions = {
      ...config,
      publicRoot,
      job: join(root, "cdn"),
      targetUrl: plan.targetUrl,
    };
    const cdnPlan = await owner.publishCatalog({ ...cdnOptions, apply: false });
    if (!/^[a-f0-9]{64}$/.test(cdnPlan.planSha256 ?? ""))
      throw new Error("CDN owner plan identity is missing");
    await privateWrite(join(root, "cdn-plan.json"), cdnPlan);
    const cdn = await owner.publishCatalog({
      ...cdnOptions,
      apply: true,
      planSha256: cdnPlan.planSha256,
    });
    const indexSha = digest(indexBody);
    if (
      !/^[a-f0-9]{64}$/.test(cdn.inventorySha256 ?? "") ||
      cdn.indexSha256 !== indexSha ||
      !Array.isArray(cdn.urls)
    )
      throw new Error("CDN owner publication receipt is unqualified");
    const current = await snapshot();
    if (!Bun.deepEquals(before, current))
      throw new Error("Registry optimistic snapshot changed during CDN publication");
    const result = await ingestNativeCrawl(
      { inputPath, policy, apply: true, maxDocuments: 256, signal },
      preserveExistingRegistry(
        {
          assertReady: () => registry.assertReady(),
          upsert: (record) => registry.upsert(enrichReviewed(record)),
        },
        new Set(before.map((row) => row.url)),
      ),
    );
    const after = await snapshot();
    if (!result.complete || after.length !== pages.length)
      throw new Error("Registry identity readback differs");
    for (const row of after) {
      const prior = before.find((entry) => entry.url === row.url);
      const expected = expectedRecords.find((entry) => entry.url === row.url)!;
      if (prior) {
        if (!Bun.deepEquals(prior, row)) throw new Error("Protected registry row changed");
      } else if (
        row.canonical_eligible ||
        row.content_hash !== expected.contentHash ||
        row.title !== expected.title ||
        row.excerpt !== expected.excerpt ||
        !Bun.deepEquals(row.provenance, expected.provenance)
      )
        throw new Error("Registry content readback differs");
    }
    await privateWrite(join(root, "registry-after.json"), after);
    await privateWrite(join(root, "receipt.json"), {
      schema: "shenron-source-publication-receipt/v1",
      requestedTarget: values.target,
      actualPublicUrl: plan.targetUrl,
      publicationSha256: digest(indexBody),
      cdn,
      registry: result,
      documents: documents.length,
      media: acquired.size,
      mediaBytes,
      mediaCoverage: reviewed
        ? "pinned reviewed same-host source images; fresh HTTP200/PNG/SHA verified"
        : "same-domain Markdown images; foreign providers remain links",
      boundedCrawlComplete: true,
      ...(reviewed ? { reviewedPublication: provenance } : {}),
    });
    console.log(
      JSON.stringify({
        actualPublicUrl: plan.targetUrl,
        documents: documents.length,
        receipt: join(root, "receipt.json"),
      }),
    );
  } finally {
    await sql`SELECT pg_advisory_unlock(hashtext('shenron-source-publication'))`.catch(() => {});
    await sql.end({ timeout: 5 });
  }
}
if (import.meta.main)
  run().catch(() => {
    console.error("Source publication failed; inspect protected job receipts and owner logs");
    process.exitCode = 1;
  });
