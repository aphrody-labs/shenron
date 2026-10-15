// SPDX-License-Identifier: Apache-2.0
/** Derive private search documents and qualified acquisition candidates from the existing pool. */
import { Database } from "bun:sqlite";
import { chmod, lstat, mkdir, rename, statfs } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

export const projectionDigest = (value: string | Uint8Array) =>
  new Bun.CryptoHasher("sha256").update(value).digest("hex");
function literalTitle(text: string, title: string | undefined) {
  if (!title || title.replace(/\s/gu, "").length < 2) return undefined;
  const pattern = [...title.replace(/\s/gu, "")]
    .map((character) => character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s*");
  const suffix = /[0-9]$/.test(title.trim()) ? "(?![0-9])" : "";
  return text.match(new RegExp(pattern + suffix, "iu"))?.[0];
}
interface PoolRow {
  id: string;
  url: string;
  kind: string;
  series: string | null;
  volumeId: number | null;
  receipt: string;
}
export interface Capture {
  document: {
    canonical_url: string;
    source_domain: string;
    http_status: number;
    payload: {
      title_raw: string;
      body_markdown: string;
      embedded_media: { url: string; type: string }[];
    };
    [key: string]: unknown;
  };
  gallery?: { pages?: unknown[]; expectedImages?: number };
  plates?: unknown[];
}
interface Volume {
  id: number;
  series: string;
  number: number;
  title: string;
  titleJa?: string;
  isbn?: string;
}
interface Template {
  config: { path: string; sha256: string };
  policy: { path: string; sha256: string };
}
async function save(path: string, value: unknown) {
  const temporary = `${path}.${process.pid}.next`;
  await Bun.write(temporary, JSON.stringify(value, null, 2));
  await chmod(temporary, 0o600);
  await rename(temporary, path);
}
async function pin(path: string) {
  const info = await lstat(path);
  if (
    !isAbsolute(path) ||
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.mode & 0o077 ||
    info.size > 256 * 1024 * 1024
  )
    throw Error("Private bounded source pin required");
  return { path, sha256: projectionDigest(await Bun.file(path).bytes()) };
}
export async function textFromPoolHtml(html: string) {
  const images = new Set<string>();
  const plates: { url: string; kind: "manga" | "cover"; printedPages: null }[] = [];
  const stripped = await new HTMLRewriter()
    .on("script,style,nav,header,footer,form", {
      element: (el) => {
        el.remove();
      },
    })
    .on("img[src]", {
      element: (el) => {
        const src = el.getAttribute("src");
        if (src) {
          images.add(src);
          const alt = el.getAttribute("alt") ?? "";
          const page = el.getAttribute("data-page-number");
          const explicitPage = page !== null && /^[0-9]{1,5}$/.test(page);
          const chapterPage =
            /(?:chap(?:ter|itre)?|第.{1,8}話).{0,80}(?:page|ページ|頁|\bp\b)\s*[0-9]{1,5}/iu.test(
              alt,
            );
          if (/\bcover\b|couverture|表紙|書影/iu.test(alt))
            plates.push({ url: src, kind: "cover", printedPages: null });
          else if (explicitPage || chapterPage)
            plates.push({ url: src, kind: "manga", printedPages: null });
        }
      },
    })
    .transform(new Response(html))
    .text();
  const parts: string[] = [];
  await new HTMLRewriter()
    .onDocument({
      text: (chunk) => {
        parts.push(chunk.text);
      },
    })
    .transform(new Response(stripped))
    .text();
  return {
    text: parts
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1024 * 1024),
    images: [...images],
    plates,
  };
}
/** A cover or an untyped DOM image never becomes a manga page. */
export function acquisitionCandidate(
  capture: Capture,
  volumes: Volume[],
  source: Template & { input: { path: string; sha256: string } },
) {
  const document = capture.document;
  if (
    document.http_status !== 200 ||
    new URL(document.canonical_url).hostname !== document.source_domain
  )
    return { reason: "qualified-source-document-required" };
  const text = document.payload.title_raw + "\n" + document.payload.body_markdown;
  const matches = volumes.filter(
    (v) =>
      v.isbn &&
      text.replaceAll("-", "").includes(v.isbn.replaceAll("-", "")) &&
      [v.title, v.titleJa].some((title) => literalTitle(text, title)),
  );
  if (matches.length !== 1) return { reason: "exact-edition-isbn-volume-identity-required" };
  const volume = matches[0]!;
  const observed = capture.gallery?.pages ?? capture.plates ?? [];
  const embedded = new Set(
    document.payload.embedded_media.filter((m) => m.type === "image").map((m) => m.url),
  );
  const pages: {
    sourceUrl: string;
    kind: "manga" | "cover" | "supplement";
    printedPages: number[] | null;
  }[] = [];
  for (const value of observed) {
    const p = value as Record<string, unknown>;
    const url = p.sourceUrl ?? p.url;
    if (
      typeof url !== "string" ||
      !embedded.has(url) ||
      !["manga", "cover", "supplement"].includes(String(p.kind))
    )
      continue;
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.hash ||
      /(^|\.)fandom\.com$/i.test(parsed.hostname)
    )
      continue;
    const printed = p.printedPages;
    if (
      printed !== null &&
      (!Array.isArray(printed) ||
        printed.length > 2 ||
        printed.some((n) => !Number.isSafeInteger(n) || n < 1))
    )
      continue;
    pages.push({
      sourceUrl: url,
      kind: p.kind as "manga" | "cover" | "supplement",
      printedPages: printed as number[] | null,
    });
  }
  if (
    pages.length < 2 ||
    !pages.some((p) => p.kind === "manga") ||
    new Set(pages.map((p) => p.sourceUrl)).size !== pages.length
  )
    return { reason: "ordered-native-gallery-with-manga-pages-required" };
  const title = [volume.title, volume.titleJa].map((t) => literalTitle(text, t)).find(Boolean)!;
  const isbnToken = text
    .match(/97[89](?:[- ]?[0-9]){10}/g)
    ?.find((s) => s.replaceAll(/[- ]/g, "") === volume.isbn!.replaceAll("-", ""));
  if (!isbnToken) return { reason: "literal-source-isbn-token-required" };
  return {
    candidate: {
      schema: "shenron-manga-acquisition-candidate/v1",
      series: volume.series,
      volumeNumber: volume.number,
      chapterNumber: volume.number,
      isbn: volume.isbn,
      expectedImages: capture.gallery?.expectedImages ?? null,
      source: {
        ...source,
        documentUrl: document.canonical_url,
        editionToken: title,
        volumeToken: title,
        isbnToken,
      },
      pages,
    },
  };
}
export async function projectPoolReceipts(
  job: string,
  options: {
    templatePath?: string;
    minimumFreeBytes?: number;
    signal?: AbortSignal;
    indexer?: (documents: string, state: string) => Promise<unknown>;
  } = {},
) {
  if (!isAbsolute(job)) throw Error("Absolute pool job required");
  const receipts = join(job, "receipts"),
    output = join(job, "derived"),
    documents = join(output, "documents"),
    candidates = join(output, "candidate-inbox"),
    quarantine = join(output, "candidate-quarantine");
  for (const dir of [documents, candidates, quarantine])
    await mkdir(dir, { recursive: true, mode: 0o700 });
  const space = await statfs(job);
  if (space.bavail * space.bsize < (options.minimumFreeBytes ?? 8 * 2 ** 30))
    return {
      schema: "shenron-manga-pool-projection/v1",
      phase: "storage-quota",
      publicWrites: 0,
      projected: 0,
      changed: 0,
      emitted: 0,
      quarantined: 0,
    };
  let existingBytes = 0;
  for await (const p of new Bun.Glob("**/*").scan({
    cwd: output,
    onlyFiles: true,
    followSymlinks: false,
  }))
    existingBytes += Bun.file(join(output, p)).size;
  let remainingBytes = Math.min(
    8 * 2 ** 30 - existingBytes,
    space.bavail * space.bsize - (options.minimumFreeBytes ?? 8 * 2 ** 30),
  );
  const db = new Database(join(job, "frontier.sqlite"), { readonly: true });
  let rows: PoolRow[];
  try {
    rows = db
      .query<PoolRow, []>(
        "SELECT id,url,kind,series,volumeId,receipt FROM pool_tasks WHERE state='done' AND receipt != '' ORDER BY CASE kind WHEN 'catalog' THEN 0 ELSE 1 END,id LIMIT 100000",
      )
      .all();
  } finally {
    db.close();
  }
  const catalogPath = join(output, "catalogue-snapshot.json");
  const catalogFile = Bun.file(catalogPath);
  let catalog = (await catalogFile.exists()) ? await catalogFile.json() : { catalog: [] };
  let template: Template | undefined;
  if (options.templatePath) {
    await pin(options.templatePath);
    template = await Bun.file(options.templatePath).json();
    for (const item of [template!.config, template!.policy])
      if ((await pin(item.path)).sha256 !== item.sha256)
        throw Error("Publication template input changed");
  }
  let projected = 0,
    changed = 0,
    emitted = 0,
    quarantined = 0;
  for (const row of rows) {
    options.signal?.throwIfAborted();
    const local = relative(receipts, resolve(row.receipt));
    if (local.startsWith("..") || isAbsolute(local) || !/^[a-f0-9]{64}\.json$/.test(local))
      throw Error("Receipt outside pool owner directory");
    const file = Bun.file(row.receipt);
    if (file.size > 32 * 1024 * 1024) continue;
    const receipt = await file.json();
    if (receipt.state !== "done" || receipt.httpStatus !== 200 || typeof receipt.body !== "string")
      continue;
    if (!/^(text\/|application\/json)/.test(receipt.contentType ?? "")) continue;
    const raw = receipt.body;
    if (projectionDigest(raw) !== receipt.sha256) {
      await save(join(quarantine, `${row.id}.json`), {
        reason: "capture-body-sha256-differs",
        task: row.id,
      });
      quarantined++;
      continue;
    }
    if (row.kind === "catalog" && Array.isArray(receipt.json?.catalog)) {
      catalog = receipt.json;
      await save(catalogPath, catalog);
    }
    const html = /html/.test(receipt.contentType);
    const extracted = html
      ? await textFromPoolHtml(raw)
      : { text: raw.slice(0, 1024 * 1024), images: [], plates: [] };
    if (!extracted.text.trim()) continue;
    const title = html ? (raw.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? row.url) : row.url;
    const capture: Capture = receipt.nativeCapture ?? {
      document: {
        crawl_id: "manga-source-pool",
        document_uid: row.id,
        canonical_url: row.url,
        source_domain: new URL(row.url).hostname,
        category: "manga-source",
        http_status: 200,
        raw_checksum: receipt.sha256,
        timestamp_utc: receipt.finishedAt,
        canonical_eligible: false,
        provenance: {
          owner: "shenron-manga-source-pool",
          receiptSha256: projectionDigest(await file.bytes()),
        },
        payload: {
          title_raw: title,
          body_markdown: extracted.text,
          embedded_media: extracted.images.flatMap((image) => {
            try {
              const u = new URL(image, row.url);
              return u.protocol === "https:" ? [{ url: u.href, type: "image" }] : [];
            } catch {
              return [];
            }
          }),
        },
      },
      plates: extracted.plates.flatMap((plate) => {
        try {
          return [{ ...plate, url: new URL(plate.url, row.url).href }];
        } catch {
          return [];
        }
      }),
    };
    const body = `# ${title}\n\nSource: ${row.url}\n\n${extracted.text}\n`;
    const target = join(documents, `${projectionDigest(row.url)}.md`);
    const old = Bun.file(target);
    if (!(await old.exists()) || projectionDigest(await old.bytes()) !== projectionDigest(body)) {
      const required = Buffer.byteLength(body) * 3 + 4096;
      if (required > remainingBytes) break;
      remainingBytes -= required;
      await Bun.write(target, body);
      await chmod(target, 0o600);
      changed++;
    }
    projected++;
    const input = join(output, `${row.id}.native.jsonl`);
    await Bun.write(input, JSON.stringify(capture.document) + "\n");
    await chmod(input, 0o600);
    const result = template
      ? acquisitionCandidate(capture, catalog.catalog ?? [], {
          ...template,
          input: await pin(input),
        })
      : { reason: "publication-owner-template-required" };
    if (result.candidate) {
      await save(
        join(candidates, `${projectionDigest(JSON.stringify(result.candidate))}.json`),
        result.candidate,
      );
      emitted++;
    } else {
      await save(join(quarantine, `${row.id}.json`), {
        task: row.id,
        url: row.url,
        reason: result.reason,
        input: await pin(input),
        mediaReferences: capture.document.payload.embedded_media.length,
      });
      quarantined++;
    }
  }
  const state = join(output, "private-home");
  let index: unknown = null;
  if (projected && (changed || !(await Bun.file(join(output, "index.json")).exists()))) {
    index = options.indexer
      ? await options.indexer(documents, state)
      : await indexDocuments(documents, state, output, options.signal);
    await save(join(output, "index.json"), index);
  }
  const report = {
    schema: "shenron-manga-pool-projection/v1",
    observedAt: new Date().toISOString(),
    projected,
    changed,
    emitted,
    quarantined,
    index,
    candidateInbox: candidates,
    privateIndex: state,
    publicWrites: 0,
    editorialWrites: 0,
    training: false,
  };
  await save(join(output, "progress.json"), report);
  return report;
}
async function indexDocuments(
  documents: string,
  state: string,
  output: string,
  signal?: AbortSignal,
) {
  const aphrody = Bun.which("aphrody");
  if (!aphrody) throw Error("Installed native index owner unavailable");
  const child = Bun.spawn(
    [
      aphrody,
      "home",
      "index",
      documents,
      "--state",
      state,
      "--profile",
      "manga-pool",
      "--label",
      "web:manga-source-pool",
    ],
    { stdout: "pipe", stderr: Bun.file(join(output, "index.stderr.log")) },
  );
  const timer = setTimeout(() => child.kill("SIGTERM"), 120000);
  const stop = () => child.kill("SIGTERM");
  signal?.addEventListener("abort", stop, { once: true });
  if (signal?.aborted) stop();
  try {
    const [stdout, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
    if (code) throw Error("Native private indexing failed; inspect private log");
    return JSON.parse(stdout);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", stop);
  }
}
