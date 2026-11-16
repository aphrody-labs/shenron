// SPDX-License-Identifier: Apache-2.0
import postgres from "postgres";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createDatabooksFreezeGate } from "@shenron/db/guards";
import { AphrodyComputeClient } from "@shenron/pipeline/aphrody";
import { prepareSource, syncSource } from "./_rag-aphrody-sync";
import type { SourceChunk } from "./_rag-sources-pg";
import { digest, sourceManifestSchema, verifySource, type SourceManifest } from "./source-coverage";
import { ingestSource, type IngestionPorts } from "./source-ingestion";

/** The repository doctrine remains authoritative when the freeze file is missing. */
export async function databooksFrozen(repoRoot: string): Promise<boolean> {
  try {
    const plan = await readFile(resolve(repoRoot, "docs/reference/root/PLAN.md"), "utf8");
    const block = plan.match(/```json\s*([\s\S]*?)```/);
    if (!block) return true;
    const doctrine = JSON.parse(block[1]!);
    if (doctrine.freeze?.databooks !== false) return true;
    return createDatabooksFreezeGate({
      freezeFile:
        process.env.DATABOOKS_FREEZE_FILE || resolve(repoRoot, ".coord/FREEZE-databooks.json"),
      production: true,
    }).state().frozen;
  } catch {
    return true;
  }
}

type StoredPage = Record<string, unknown> & { number?: unknown; text?: unknown; text_fr?: unknown };
type Chapter = {
  id: number;
  series: string;
  chapter_number: number | null;
  volume_id: number | null;
  visible: boolean;
  pages: unknown;
};
type MangaLocator = {
  series: string;
  tome: string;
  planche: number;
  chapterId: number;
  pageIndex: number;
};

export function readerPageNumber(image: string, pageIndex: number): number {
  const filename = image.split("?")[0]!.split("/").pop() ?? "";
  const numbers = filename.replace(/\.[a-z0-9]+$/i, "").match(/\d+/g);
  const value = numbers?.length ? Number(numbers.at(-1)) : Number.NaN;
  return Number.isFinite(value) && value > 0 ? value : pageIndex;
}
export function mangaLocator(
  source: SourceManifest,
  page: SourceManifest["pages"][number],
  chapter: Chapter,
): MangaLocator {
  const reader = page.mangaReader;
  if (
    source.databaseTarget?.table !== "db_manga_volumes" ||
    !reader ||
    reader.chapterId !== chapter.id ||
    !chapter.visible ||
    chapter.volume_id !== source.databaseTarget.id ||
    !Array.isArray(chapter.pages) ||
    chapter.pages[reader.pageIndex - 1] !== page.readerImage
  )
    throw new Error(`Reader mapping mismatch:${page.number}`);
  if (!page.readerImage || readerPageNumber(page.readerImage, reader.pageIndex) !== reader.planche)
    throw new Error(`Reader page identity mismatch:${page.number}`);
  return {
    series: chapter.series,
    tome: chapter.series === "DB" ? `vol${chapter.chapter_number}` : `ch${chapter.id}`,
    planche: reader.planche,
    chapterId: chapter.id,
    pageIndex: reader.pageIndex,
  };
}

export async function verifyReaderAsset(
  image: string | undefined,
  sha256: string,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  if (!image || (!image.startsWith("https://") && !/^\/[^/]/.test(image))) return false;
  try {
    const url = new URL(image, "https://dragonballfr.com");
    if (
      !["dragonballfr.com", "cdn.dragonballfr.com"].includes(url.hostname) ||
      url.protocol !== "https:" ||
      url.username ||
      url.password
    )
      return false;
    const response = await fetcher(url, { redirect: "error", signal: AbortSignal.timeout(15000) });
    if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) return false;
    if (Number(response.headers.get("content-length")) > 30 * 1024 * 1024) return false;
    const bytes = await response.arrayBuffer();
    return bytes.byteLength <= 30 * 1024 * 1024 && digest(new Uint8Array(bytes)) === sha256;
  } catch {
    return false;
  }
}

export function mergeDatabookPages(
  pages: StoredPage[],
  source: SourceManifest,
  manifestDigest: string,
): StoredPage[] {
  for (const page of source.pages) {
    const matches = pages.filter((stored) => Number(stored.number) === page.number);
    if (matches.length !== 1 || !page.readerImage || matches[0]!.image !== page.readerImage)
      throw new Error(`Page image identity mismatch:${page.number}`);
  }
  return pages.map((stored) => {
    const page = source.pages.find((item) => item.number === Number(stored.number));
    if (!page) return stored;
    const key = field(page.lang);
    if (text(stored[key]).trim() && text(stored[key]) !== page.text)
      throw new Error(`Protected transcription conflict:${page.number}`);
    const existing = stored[key];
    const value =
      existing && typeof existing === "object" && !Array.isArray(existing)
        ? { ...existing, markdown: page.text }
        : page.text;
    return {
      ...stored,
      [key]: value,
      source_manifest_digest: manifestDigest,
      asset_sha256: page.sha256,
    };
  });
}
function text(value: unknown): string {
  return typeof value === "string"
    ? value
    : value &&
        typeof value === "object" &&
        "markdown" in value &&
        typeof value.markdown === "string"
      ? value.markdown
      : "";
}
function field(lang: string): "text" | "text_fr" {
  if (lang === "en") throw new Error("Existing databook reader has no English transcription field");
  return lang === "fr" ? "text_fr" : "text";
}
function chunks(source: SourceManifest): SourceChunk[] {
  const id = source.databaseTarget?.id;
  return source.pages
    .filter((page) => !page.noText)
    .flatMap((page) => {
      const result: SourceChunk[] = [];
      for (let start = 0; start < page.text.length; start += 1400)
        result.push({
          kind: source.databaseTarget?.table === "db_manga_volumes" ? "manga_page" : "databook",
          title: `${source.title} — ${page.number}`,
          url:
            source.databaseTarget?.table === "db_manga_volumes"
              ? `https://dragonballfr.com/wiki/manga/${page.mangaReader?.chapterId}?planche=${page.mangaReader?.pageIndex}`
              : `https://dragonballfr.com/wiki/databooks/${id}#planche-${page.number}`,
          content: page.text.slice(start, start + 1400),
          lang: page.lang,
          entity: "",
        });
      return result;
    });
}

export async function databaseSourceAudit(sql: postgres.Sql, source: SourceManifest) {
  const target = source.databaseTarget;
  const candidates =
    target?.table === "db_databooks"
      ? await sql`SELECT id, title, title_ja, source_url, visible, pages FROM bot.db_databooks WHERE id=${target.id}`
      : target?.table === "db_manga_volumes"
        ? await sql`SELECT id, title, visible, isbn FROM bot.db_manga_volumes WHERE id=${target.id}`
        : source.family === "soshuhen" || source.family === "full_color"
          ? await sql`SELECT id, title, visible, isbn FROM bot.db_manga_volumes WHERE isbn=${source.edition.identifier}`
          : await sql`SELECT id, title, visible, pages FROM bot.db_databooks WHERE source_url=${source.citation} AND title=${source.title}`;
  const issues: string[] = [];
  if (!target) issues.push("explicit-database-target-required");
  if (candidates.length !== 1) issues.push("database-target-not-unique");
  if (candidates[0] && !candidates[0].visible) issues.push("database-target-hidden");
  if (
    target?.table === "db_databooks" &&
    candidates[0] &&
    candidates[0].title !== source.title &&
    candidates[0].title_ja !== source.title &&
    candidates[0].source_url !== source.citation
  )
    issues.push("database-target-identity-mismatch");
  if (
    target?.table === "db_manga_volumes" &&
    candidates[0] &&
    String(candidates[0].isbn ?? "").replaceAll("-", "") !==
      source.edition.identifier.replaceAll("-", "")
  )
    issues.push("database-target-edition-mismatch");
  const locators: MangaLocator[] = [];
  const mangaRows: Record<string, unknown>[] = [];
  if (target?.table === "db_manga_volumes")
    for (const page of source.pages) {
      if (!page.mangaReader) {
        issues.push(`chapter-mapping-required:${page.number}`);
        continue;
      }
      const [chapter] = await sql<
        Chapter[]
      >`SELECT id, series, chapter_number, volume_id, visible, pages FROM bot.db_manga_chapters WHERE id=${page.mangaReader.chapterId}`;
      try {
        if (!chapter) throw new Error("Chapter missing");
        const locator = mangaLocator(source, page, chapter);
        if (
          locators.some(
            (item) =>
              item.series === locator.series &&
              item.tome === locator.tome &&
              item.planche === locator.planche,
          )
        )
          throw new Error("Duplicate manga locator");
        locators.push(locator);
        const rows =
          await sql`SELECT id, series, tome, planche, text, lang, lines, has_ja, line_count, char_count FROM bot.db_manga_pages WHERE series=${locator.series} AND tome=${locator.tome} AND planche=${locator.planche}`;
        if (rows.length > 1) issues.push(`duplicate-manga-page:${page.number}`);
        if (rows[0]) mangaRows.push({ ...rows[0], sourcePage: page.number });
      } catch {
        issues.push(`chapter-mapping-invalid:${page.number}`);
      }
      if (!(await verifyReaderAsset(page.readerImage, page.sha256)))
        issues.push(`reader-asset:${page.number}`);
    }
  const stored = Array.isArray(candidates[0]?.pages) ? (candidates[0]!.pages as StoredPage[]) : [];
  if (target?.table === "db_databooks")
    for (const page of source.pages) {
      const matches = stored.filter((item) => Number(item.number) === page.number);
      if (matches.length !== 1) issues.push(`database-page-slot:${page.number}`);
      if (!page.readerImage || matches[0]?.image !== page.readerImage)
        issues.push(`database-image-identity:${page.number}`);
      else if (!(await verifyReaderAsset(page.readerImage, page.sha256)))
        issues.push(`reader-asset:${page.number}`);
      if (page.lang === "en") issues.push(`unsupported-language:${page.number}`);
    }
  return {
    candidates: candidates.map((item) => ({
      id: item.id,
      title: item.title,
      visible: item.visible,
    })),
    issues,
    stored,
    locators,
    mangaRows,
  };
}

export function postgresIngestionPorts(
  sql: postgres.Sql,
  client: AphrodyComputeClient,
  repoRoot: string,
): IngestionPorts {
  const acknowledged = new Set<string>();
  const sourceName = (source: SourceManifest) =>
    `source_${source.id.slice(0, 40)}_${digest(source.id).slice(0, 16)}`;
  return {
    async verifyDatabase(source, manifestDigest) {
      const audit = await databaseSourceAudit(sql, source);
      if (audit.issues.length) return false;
      if (source.databaseTarget?.table === "db_manga_volumes")
        return source.pages.every((page) => {
          const row = audit.mangaRows.find((item) => item.sourcePage === page.number);
          return row?.text === page.text && row.lang === page.lang;
        });
      return source.pages.every((page) => {
        const stored = audit.stored.find((item) => Number(item.number) === page.number);
        return (
          stored?.source_manifest_digest === manifestDigest &&
          stored.asset_sha256 === page.sha256 &&
          text(stored[field(page.lang)]) === page.text
        );
      });
    },
    async deposit(source, manifestDigest) {
      if (source.databaseTarget?.table === "db_manga_volumes") {
        const audit = await databaseSourceAudit(sql, source);
        if (audit.issues.length) throw new Error(audit.issues.join(", "));
        await sql.begin(async (tx) => {
          const [volume] =
            await tx`SELECT id, isbn, visible FROM bot.db_manga_volumes WHERE id=${source.databaseTarget!.id} FOR SHARE`;
          if (
            !volume?.visible ||
            String(volume.isbn ?? "").replaceAll("-", "") !==
              source.edition.identifier.replaceAll("-", "")
          )
            throw new Error("Volume edition changed");
          await tx`LOCK TABLE bot.db_manga_pages IN SHARE ROW EXCLUSIVE MODE`;
          const [maximum] = await tx`SELECT coalesce(max(id),0) AS id FROM bot.db_manga_pages`;
          let nextId = Number(maximum!.id);
          for (const page of source.pages) {
            const reader = page.mangaReader;
            if (!reader) throw new Error("Reviewed manga reader mapping required");
            const [chapter] = await tx<
              Chapter[]
            >`SELECT id, series, chapter_number, volume_id, visible, pages FROM bot.db_manga_chapters WHERE id=${reader.chapterId} FOR SHARE`;
            if (!chapter) throw new Error("Chapter missing");
            const locator = mangaLocator(source, page, chapter);
            if (!(await verifyReaderAsset(page.readerImage, page.sha256)))
              throw new Error(`Reader image changed:${page.number}`);
            const rows =
              await tx`SELECT * FROM bot.db_manga_pages WHERE series=${locator.series} AND tome=${locator.tome} AND planche=${locator.planche}`;
            if (rows.length > 1) throw new Error("Duplicate manga locator");
            const before = rows[0];
            if (typeof before?.text === "string" && before.text.trim() && before.text !== page.text)
              throw new Error(`Protected transcription conflict:${page.number}`);
            const id = before?.id ?? ++nextId;
            const data = {
              series: locator.series,
              tome: locator.tome,
              planche: locator.planche,
              text: page.text,
              lang: page.lang,
              lines: JSON.stringify(page.noText ? [] : [page.text]),
              has_ja: page.lang === "ja" && !page.noText ? 1 : 0,
              line_count: page.noText ? 0 : 1,
              char_count: page.text.length,
            };
            if (before) await tx`UPDATE bot.db_manga_pages SET ${tx(data)} WHERE id=${id}`;
            else await tx`INSERT INTO bot.db_manga_pages ${tx({ id, ...data })}`;
            await tx`INSERT INTO public.wiki_revisions ${tx({ id: crypto.randomUUID().replaceAll("-", "").slice(0, 24), tableName: "db_manga_pages", rowId: String(id), action: before ? "update" : "create", label: `${source.title} — ${page.number}`, before: before ? tx.json(before as Parameters<typeof tx.json>[0]) : null, after: tx.json(data), editorId: "agent", editorName: "Source ingestion" })}`;
          }
        });
        return;
      }
      if (source.databaseTarget?.table !== "db_databooks")
        throw new Error("Reviewed manga chapter mapping required before deposition");
      if (await databooksFrozen(repoRoot)) throw new Error("Databooks editorial freeze active");
      const id = source.databaseTarget.id;
      const audit = await databaseSourceAudit(sql, source);
      if (audit.issues.length) throw new Error(audit.issues.join(", "));
      await sql.begin(async (tx) => {
        const [before] =
          await tx`SELECT id, title, title_ja, source_url, pages, visible FROM bot.db_databooks WHERE id=${id} FOR UPDATE`;
        if (!before?.visible || !Array.isArray(before.pages))
          throw new Error("Visible databook page slots required");
        if (
          before.title !== source.title &&
          before.title_ja !== source.title &&
          before.source_url !== source.citation
        )
          throw new Error("Databook identity changed");
        const pages = before.pages as StoredPage[];
        const after = mergeDatabookPages(pages, source, manifestDigest);
        for (const page of source.pages)
          if (!(await verifyReaderAsset(page.readerImage, page.sha256)))
            throw new Error(`Reader image changed:${page.number}`);
        for (const page of source.pages)
          if (pages.filter((stored) => Number(stored.number) === page.number).length !== 1)
            throw new Error(`Missing or duplicate page slot:${page.number}`);
        if (await databooksFrozen(repoRoot)) throw new Error("Databooks editorial freeze active");
        await tx`UPDATE bot.db_databooks SET pages=${tx.json(after as Parameters<typeof tx.json>[0])} WHERE id=${id}`;
        await tx`INSERT INTO public.wiki_revisions ${tx({ id: crypto.randomUUID().replaceAll("-", "").slice(0, 24), tableName: "db_databooks", rowId: String(id), action: "update", label: source.title, before: tx.json({ pages } as Parameters<typeof tx.json>[0]), after: tx.json({ pages: after } as Parameters<typeof tx.json>[0]), editorId: "agent", editorName: "Source ingestion" })}`;
      });
    },
    async syncRag(source, manifestDigest) {
      await syncSource(client, sourceName(source), chunks(source), undefined, {
        apply: true,
        requireVectors: true,
      });
      acknowledged.add(manifestDigest);
    },
    async verifyRag(source, manifestDigest) {
      // The wire exposes only snippets: metadata alone cannot prove content identity.
      // Require this execution's full-generation acknowledgement before completion.
      if (!acknowledged.has(manifestDigest)) return false;
      const documents = prepareSource(sourceName(source), chunks(source)).documents;
      if (!documents.length) return source.pages.every((page) => page.noText);
      const stats = await client.ragStats();
      const rows = stats.sources.filter((item) => item.sourceId === sourceName(source));
      if (
        rows.reduce((total, item) => total + item.count, 0) !== documents.length ||
        rows.reduce((total, item) => total + (item.vectors ?? 0), 0) !== documents.length
      )
        return false;
      for (const expected of documents) {
        const actual = await client.ragDocument(expected.sourceId);
        if (actual?.title !== expected.title || actual.url !== expected.url) return false;
      }
      return true;
    },
    async checkpoint() {
      /* Live database provenance and remote document verification are the checkpoints. */
    },
  };
}

export async function auditBibliography(path: string, databaseUrl: string | undefined) {
  const payload = (await Bun.file(path).json()) as { schema?: unknown; entries?: unknown };
  if (payload.schema !== "shenron-source-bibliography/v1" || !Array.isArray(payload.entries))
    throw new Error("Invalid source bibliography");
  const sources: { id: string; candidates: readonly unknown[]; issues: string[] }[] = [];
  const sql = databaseUrl
    ? postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 5 })
    : null;
  try {
    for (const entry of payload.entries as Record<string, unknown>[]) {
      if (typeof entry.id !== "string" || typeof entry.family !== "string")
        throw new Error("Invalid bibliography entry");
      const issues = ["verified-assets-and-page-manifest-required", "rights-approval-required"];
      let candidates: readonly unknown[] = [];
      if (!sql) issues.push("DATABASE_URL missing");
      else {
        const edition = entry.edition as { identifier?: unknown } | undefined;
        const titles = entry.titles as { ja?: unknown } | undefined;
        const identifier = typeof edition?.identifier === "string" ? edition.identifier : "";
        const title = typeof titles?.ja === "string" ? titles.ja : "";
        candidates = await sql.begin(async (tx) => {
          await tx`SET TRANSACTION READ ONLY`;
          return entry.family === "soshuhen" || entry.family === "full_color"
            ? await tx`SELECT id, title, isbn, visible FROM bot.db_manga_volumes WHERE replace(isbn, '-', '')=${identifier.replaceAll("-", "")}`
            : await tx`SELECT id, title, visible, jsonb_array_length(coalesce(pages, '[]'::jsonb)) AS page_slots FROM bot.db_databooks WHERE title_ja=${title} AND ${title}<>''`;
        });
        if (candidates.length !== 1) issues.push("database-target-not-unique");
      }
      sources.push({ id: entry.id, candidates, issues });
    }
    return { version: 1 as const, complete: false, databaseChecked: Boolean(sql), sources };
  } finally {
    await sql?.end();
  }
}

if (import.meta.main && Bun.argv[2] === "--bibliography-audit") {
  const path = Bun.argv[3];
  if (!path)
    throw new Error(
      "Usage: bun source-ingestion-postgres.ts --bibliography-audit <bibliography.json> [report.json]",
    );
  const report = await auditBibliography(path, process.env.DATABASE_URL);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (Bun.argv[4]) await Bun.write(Bun.argv[4], json);
  console.log(json);
  process.exitCode = 2;
} else if (import.meta.main) {
  const [manifestPath, assetRoot] = Bun.argv.slice(2);
  if (!manifestPath || !assetRoot)
    throw new Error(
      "Usage: bun source-ingestion-postgres.ts <manifest.json> <asset-root> [--apply]",
    );
  const repoRoot = resolve(import.meta.dir, "../../..");
  const source = sourceManifestSchema.parse(await Bun.file(manifestPath).json());
  const coverage = await verifySource(source, assetRoot);
  const frozen =
    source.databaseTarget?.table === "db_databooks" && (await databooksFrozen(repoRoot));
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log(
      JSON.stringify(
        {
          id: source.id,
          ready: coverage.ready,
          complete: false,
          frozen,
          issues: [...coverage.issues, "DATABASE_URL missing"],
        },
        null,
        2,
      ),
    );
    process.exitCode = 2;
  } else {
    const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 5 });
    try {
      const audit = await databaseSourceAudit(sql, source);
      if (!Bun.argv.includes("--apply")) {
        console.log(
          JSON.stringify(
            {
              id: source.id,
              ready: coverage.ready,
              complete: false,
              frozen,
              issues: [...coverage.issues, ...audit.issues],
              candidates: audit.candidates,
            },
            null,
            2,
          ),
        );
        if (!coverage.ready || audit.issues.length || frozen) process.exitCode = 2;
      } else {
        if (audit.issues.length) throw new Error(audit.issues.join(", "));
        console.log(
          JSON.stringify(
            await ingestSource(
              source,
              assetRoot,
              postgresIngestionPorts(sql, new AphrodyComputeClient(), repoRoot),
              { apply: true, editorialFrozen: frozen },
            ),
          ),
        );
      }
    } finally {
      await sql.end();
    }
  }
}
