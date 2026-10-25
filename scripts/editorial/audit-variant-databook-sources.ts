// SPDX-License-Identifier: Apache-2.0

/** Read-only source inventory. This command never performs OCR or editorial writes. */
export const MAX_SCAN_BATCH = 4;
const PUBLIC_ORIGIN = "https://dragonballfr.com";
const CDN_ORIGIN = "https://cdn.dragonballfr.com";

export interface DatabookPageSource {
  number: number;
  image: string | null;
}

export interface DatabookSource {
  id: number;
  title: string;
  pages: DatabookPageSource[];
}

export interface ReviewedPage {
  index: number;
  printedPage: number;
  sha256: string;
  reviewerNote: string;
}

export function parsePageIndices(value: string): number[] {
  const indices = value.split(",").map((part) => Number(part.trim()));
  if (!indices.length || indices.some((number) => !Number.isSafeInteger(number) || number < 1)) {
    throw new Error("Page indices must be positive integers");
  }
  if (new Set(indices).size !== indices.length) throw new Error("Duplicate page index");
  if (indices.length > MAX_SCAN_BATCH) throw new Error("At most four scans per review batch");
  return indices;
}

export function parseDatabook(value: unknown): DatabookSource {
  if (!value || typeof value !== "object") throw new Error("Invalid databook catalogue");
  const book = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(book.id) ||
    Number(book.id) < 1 ||
    typeof book.title !== "string" ||
    !Array.isArray(book.pages)
  ) {
    throw new Error("Databook id, title and pages are required");
  }
  const seen = new Set<number>();
  const pages = book.pages.map((raw: unknown) => {
    if (!raw || typeof raw !== "object") throw new Error("Invalid page record");
    const page = raw as Record<string, unknown>;
    if (!Number.isSafeInteger(page.number) || Number(page.number) < 1)
      throw new Error("Invalid page index");
    const number = Number(page.number);
    if (seen.has(number)) throw new Error("Duplicate catalogue page index");
    seen.add(number);
    return {
      number,
      image: typeof page.image === "string" && page.image.trim() ? page.image : null,
    };
  });
  return { id: Number(book.id), title: book.title, pages };
}

export function resolveScanUrl(image: string): string {
  const clean = image.replace(/^\.\//, "");
  const url = new URL(clean, `${CDN_ORIGIN}/`);
  if (
    url.protocol !== "https:" ||
    ![PUBLIC_ORIGIN, CDN_ORIGIN].includes(url.origin) ||
    url.username ||
    url.password ||
    !/^\/(?:assets\/)?wiki\/databooks\//.test(url.pathname)
  ) {
    throw new Error("Only public Shenron databook scan URLs are accepted");
  }
  return url.href;
}

export function matchPrintedPage(
  index: number,
  sha256: string,
  reviews: ReviewedPage[],
): ReviewedPage | null {
  const matches = reviews.filter((review) => review.index === index);
  if (matches.length > 1) throw new Error("Duplicate reviewed page index");
  const review = matches[0];
  if (!review) return null;
  if (
    !Number.isSafeInteger(review.printedPage) ||
    review.printedPage < 1 ||
    !review.reviewerNote?.trim()
  ) {
    throw new Error("A printed folio and visual reviewer note are required");
  }
  if (!/^[a-f0-9]{64}$/.test(review.sha256) || review.sha256 !== sha256) {
    throw new Error("Reviewed folio does not match the downloaded scan SHA256");
  }
  return review;
}

export function privateOutputDirectory(value: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/\/+$/, "");
  if (
    !normalized.startsWith("var/reports/") ||
    normalized.split("/").some((part) => part === ".." || part === "." || !part)
  ) {
    throw new Error("Output must be a relative directory under var/reports/");
  }
  return normalized;
}

interface Options {
  bookId: number;
  indices: number[];
  output: string;
  catalogueFile?: string;
  reviewedPagesFile?: string;
  fetchScans: boolean;
}

async function runAudit(options: Options) {
  const catalogueUrl = `${PUBLIC_ORIGIN}/api/databooks/${options.bookId}`;
  const raw: unknown = options.catalogueFile
    ? await Bun.file(options.catalogueFile).json()
    : await fetch(catalogueUrl, { signal: AbortSignal.timeout(20_000) }).then(async (response) => {
        if (!response.ok) throw new Error(`Catalogue HTTP ${response.status}`);
        return response.json();
      });
  const book = parseDatabook(raw);
  if (book.id !== options.bookId) throw new Error("Catalogue book identity mismatch");
  const selected = options.indices.map((index) => {
    const page = book.pages.find((candidate) => candidate.number === index);
    if (!page) throw new Error(`Catalogue page ${index} is absent`);
    return page;
  });
  const rawReviews: unknown = options.reviewedPagesFile
    ? await Bun.file(options.reviewedPagesFile).json()
    : [];
  if (!Array.isArray(rawReviews)) throw new Error("Reviewed pages must be an array");
  for (const item of rawReviews) {
    if (!item || typeof item !== "object" || !Number.isSafeInteger(item.index))
      throw new Error("Invalid review record");
  }
  const reviews = rawReviews as ReviewedPage[];
  if (reviews.length && !options.fetchScans)
    throw new Error("Reviewed folios require downloading and hashing the scans");
  const pages: Array<Record<string, unknown>> = [];
  // Serial requests keep this batch below both the three-request and four-image limits.
  for (const page of selected) {
    const record: Record<string, unknown> = {
      index: page.number,
      printedPage: null,
      readerUrl: `${PUBLIC_ORIGIN}/wiki/databooks/${book.id}#planche-${page.number}`,
      image: page.image,
      status: page.image ? "catalogued-not-downloaded" : "SCAN_INDISPONIBLE",
    };
    if (page.image) {
      record.assetUrl = resolveScanUrl(page.image);
      if (options.fetchScans) {
        const response = await fetch(String(record.assetUrl), {
          signal: AbortSignal.timeout(20_000),
        });
        record.httpStatus = response.status;
        const contentType = response.headers.get("content-type");
        record.contentType = contentType;
        if (!response.ok || !contentType?.startsWith("image/")) {
          record.status = "SCAN_INDISPONIBLE";
        } else {
          const bytes = new Uint8Array(await response.arrayBuffer());
          const sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
          const extension =
            { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[
              contentType.split(";")[0]!
            ] ?? "image";
          const localFile = `${options.output}/scans/${book.id}-${String(page.number).padStart(4, "0")}.${extension}`;
          await Bun.write(localFile, bytes);
          Object.assign(record, {
            sha256,
            bytes: bytes.length,
            localFile,
            status: "downloaded-unreviewed",
          });
          const review = matchPrintedPage(page.number, sha256, reviews);
          if (review)
            Object.assign(record, {
              printedPage: review.printedPage,
              reviewerNote: review.reviewerNote,
              status: "folio-visually-reviewed",
            });
        }
      }
    }
    pages.push(record);
  }
  const inventory = {
    observedAt: new Date().toISOString(),
    operation: "read-only-source-inventory",
    ocrPerformed: false,
    editorialWritesPerformed: false,
    databook: { id: book.id, title: book.title, catalogueUrl, cataloguePages: book.pages.length },
    counters: {
      requested: selected.length,
      downloaded: pages.filter((page) => page.sha256).length,
      visuallyReviewedFolios: pages.filter((page) => page.printedPage !== null).length,
      unavailable: pages.filter((page) => page.status === "SCAN_INDISPONIBLE").length,
    },
    pages,
  };
  await Bun.write(
    `${options.output}/catalogue-${book.id}.json`,
    JSON.stringify(raw, null, 2) + "\n",
  );
  await Bun.write(`${options.output}/inventory.json`, JSON.stringify(inventory, null, 2) + "\n");
  console.log(JSON.stringify({ output: options.output, ...inventory.counters }));
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  if (args.includes("--help")) {
    console.log(
      "Inventaire en lecture seule, sans OCR ni dépôt. Depuis la racine : bun scripts/editorial/audit-variant-databook-sources.ts [--book-id 4] [--pages 78,79] [--catalogue fichier.json] [--fetch-scans] [--reviewed-pages folios.json] [--out var/reports/wiki-databook-power-sources-20261025]",
    );
  } else {
    const value = (flag: string, fallback?: string) => {
      const position = args.indexOf(flag);
      if (position < 0) return fallback;
      const next = args[position + 1];
      if (!next || next.startsWith("--")) throw new Error(`Missing value for ${flag}`);
      return next;
    };
    const supported = new Set([
      "--book-id",
      "--pages",
      "--catalogue",
      "--fetch-scans",
      "--reviewed-pages",
      "--out",
    ]);
    if (args.some((arg) => arg.startsWith("--") && !supported.has(arg)))
      throw new Error("Unknown option");
    const bookId = Number(value("--book-id", "4"));
    if (!Number.isSafeInteger(bookId) || bookId < 1) throw new Error("Invalid book id");
    await runAudit({
      bookId,
      indices: parsePageIndices(value("--pages", "78,79")!),
      output: privateOutputDirectory(
        value("--out", "var/reports/wiki-databook-power-sources-20261025")!,
      ),
      catalogueFile: value("--catalogue"),
      reviewedPagesFile: value("--reviewed-pages"),
      fetchScans: args.includes("--fetch-scans"),
    });
  }
}
