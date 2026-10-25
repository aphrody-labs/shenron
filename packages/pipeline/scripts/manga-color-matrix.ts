#!/usr/bin/env bun
/**
 * Build a local, read-only inventory of manga editions, OCR rows and image files.
 * No network access is used. All generated files are confined to --out.
 */
import { Database } from "bun:sqlite";
import { stat } from "node:fs/promises";
import { resolve, isAbsolute, sep } from "node:path";

type Edition =
  | "Dragon Ball Full Color"
  | "Dragon Ball Super"
  | "Dragon Ball"
  | "Dragon Ball Super Color Edition";
type ImageRole = "cover" | "thumbnail" | "page" | "unclassified";
type RecordRow = Record<string, unknown>;

export interface MatrixOptions {
  snapshot: string;
  assets: string;
  out: string;
  catalogue?: string;
  plan?: boolean;
}

export interface ImageRecord {
  path: string;
  series: string;
  role: ImageRole;
  bytes: number;
  sha256: string;
  width: number | null;
  height: number | null;
  format: string | null;
  decodeError?: string;
}

export interface MangaMatrixResult {
  version: number;
  inputs: { snapshot: string; assets: string; catalogue: string | null };
  editionStatus: {
    DB: Record<string, unknown>;
    DBFC: {
      seriesKey: true;
      officialEditionVerified: false;
      source: string;
      catalogueVolumeCount: number;
    };
    DBS: { publishedColorEdition: boolean; publishedEditions: string[]; source: string };
    DBSFCJP: { publishedVolumes: number; source: string; verifiedVolumes: number[] };
  };
  totals: Record<string, number> & { records: number; pageImages: number };
  records: RecordRow[];
  assets: ImageRecord[];
  duplicates: Array<{ sha256: string; paths: string[] }>;
  gaps: RecordRow[];
}

const IMAGE_EXTENSIONS = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".webp"]);
const EDITIONS: Record<string, Edition> = {
  DB: "Dragon Ball",
  DBFC: "Dragon Ball Full Color",
  DBS: "Dragon Ball Super",
  DBSFCJP: "Dragon Ball Super Color Edition",
};

function fail(message: string): never {
  throw new Error(message);
}

function parseArgs(argv: string[]): MatrixOptions {
  const result: Partial<MatrixOptions> = {};
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]!;
    if (argument === "--plan") {
      result.plan = true;
      continue;
    }
    if (!["--snapshot", "--assets", "--catalogue", "--out"].includes(argument))
      fail(`Option inconnue : ${argument}`);
    const value = argv[++index];
    if (!value || value.startsWith("--")) fail(`Valeur manquante pour ${argument}`);
    if (argument === "--snapshot") result.snapshot = value;
    else if (argument === "--assets") result.assets = value;
    else if (argument === "--catalogue") result.catalogue = value;
    else result.out = value;
  }
  if (!result.snapshot || !result.assets || !result.out)
    fail(
      "Usage : bun packages/pipeline/scripts/manga-color-matrix.ts --snapshot <sqlite> --assets <dossier> --out <dossier> [--catalogue <json>] [--plan]",
    );
  return result as MatrixOptions;
}

function quoteCsv(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function toCsv(rows: unknown[][]): string {
  return `${rows.map((row) => row.map(quoteCsv).join(",")).join("\n")}\n`;
}

function hasTable(db: Database, name: string): boolean {
  return Boolean(
    db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name),
  );
}

function rowsIfPresent(db: Database, table: string, sql: string): RecordRow[] {
  if (!hasTable(db, table)) return [];
  return db.query(sql).all() as RecordRow[];
}

function seriesFromRelativePath(path: string): string | null {
  return path.split(/[\\/]/).find((part) => part in EDITIONS) ?? null;
}

function imageRole(path: string): ImageRole {
  const pieces = path.split(/[\\/]/).map((part) => part.toLowerCase());
  const name = pieces.at(-1) ?? "";
  if (
    /(^|[-_.])(thumb|thumbnail|miniature)([-_.]|$)/.test(name) ||
    pieces.some((part) => ["thumb", "thumbs", "thumbnail", "thumbnails"].includes(part))
  )
    return "thumbnail";
  if (
    /(^|[-_.])(cover|covers|couverture)([-_.]|$)/.test(name) ||
    pieces.some((part) => ["cover", "covers", "couverture"].includes(part))
  )
    return "cover";
  return seriesFromRelativePath(path) ? "page" : "unclassified";
}

function chapterOrVolume(path: string, series: string): string | null {
  const normalized = path.replaceAll("\\", "/");
  const patterns =
    series === "DB"
      ? [/\bvol(?:ume)?[-_ ]?(\d+)\b/i, /\b(?:tome|t)[-_ ]?(\d+)\b/i]
      : series === "DBFC"
        ? [/\bvol(?:ume)?[-_ ]?(\d+)\b/i, /\bch(?:apter)?[-_ ]?(\d+)\b/i]
        : [/\bch(?:apter)?[-_ ]?(\d+)\b/i];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match)
      return `${series}:${pattern.source.startsWith("\\bvol") || pattern.source.startsWith("\\b(?:tome") ? "vol" : "ch"}${Number(match[1])}`;
  }
  return null;
}

async function walkImages(root: string, catalogueCovers: Set<string>): Promise<ImageRecord[]> {
  const files: string[] = [];
  const glob = new Bun.Glob("**/*");
  for await (const path of glob.scan({ cwd: root, onlyFiles: true, followSymlinks: false })) {
    const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
    if (IMAGE_EXTENSIONS.has(extension)) files.push(path);
  }
  files.sort();
  const output: ImageRecord[] = [];
  for (const path of files) {
    const absolute = resolve(root, path);
    const bytes = await Bun.file(absolute).bytes();
    const hash = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    const normalized = path.split(sep).join("/");
    const isCatalogueCover = catalogueCovers.has(normalized);
    const series = seriesFromRelativePath(path) ?? (isCatalogueCover ? "DBCN" : "unknown");
    const role = isCatalogueCover ? "cover" : imageRole(path);
    const record: ImageRecord = {
      path: normalized,
      series,
      role,
      bytes: bytes.byteLength,
      sha256: hash,
      width: null,
      height: null,
      format: null,
    };
    try {
      if (!(Bun as any).Image) throw new Error("Bun.Image indisponible dans ce runtime");
      const metadata = await new (Bun as any).Image(absolute).metadata();
      record.width = Number.isFinite(metadata.width) ? metadata.width : null;
      record.height = Number.isFinite(metadata.height) ? metadata.height : null;
      record.format = metadata.format ?? null;
      if (!(record.width && record.height)) throw new Error("dimensions absentes ou nulles");
    } catch (error) {
      record.decodeError = error instanceof Error ? error.message : String(error);
    }
    output.push(record);
  }
  return output;
}

function catalogueRecords(catalogue: any): any[] {
  return (
    catalogue?.collections?.find((item: any) => item.slug === "dragonball_full_color")?.ouvrages ??
    []
  );
}

function catalogueCoverPaths(entries: RecordRow[], assetsRoot: string): Set<string> {
  const rootName = assetsRoot.split(/[\\/]/).at(-1)?.toLowerCase();
  const paths = new Set<string>();
  for (const entry of entries as any[]) {
    const raw = String(entry.couverture?.chemin ?? "")
      .replaceAll("\\", "/")
      .replace(/^\.\//, "");
    const normalized = rootName === "assets" ? raw.replace(/^assets\//, "") : raw;
    if (normalized) paths.add(normalized);
  }
  return paths;
}

export async function buildMangaColorMatrix(options: MatrixOptions): Promise<MangaMatrixResult> {
  for (const [label, path] of [
    ["snapshot", options.snapshot],
    ["assets", options.assets],
  ] as const) {
    if (!isAbsolute(path))
      fail(`Le chemin --${label} doit être absolu pour rendre la source explicite : ${path}`);
    try {
      const metadata = await stat(path);
      if (label === "snapshot" && !metadata.isFile())
        fail(`Le snapshot doit être un fichier SQLite : ${path}`);
      if (label === "assets" && !metadata.isDirectory())
        fail(`--assets doit être un dossier : ${path}`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Le snapshot")) throw error;
      if (error instanceof Error && error.message.startsWith("--assets")) throw error;
      fail(`Entrée absente (--${label}) : ${path}`);
    }
  }
  if (options.catalogue && !(await Bun.file(options.catalogue).exists()))
    fail(`Catalogue absent : ${options.catalogue}`);
  const snapshot = resolve(options.snapshot);
  const assetsRoot = resolve(options.assets);
  const out = resolve(options.out);
  const db = new Database(snapshot, { readonly: true, create: false });
  let volumes: RecordRow[] = [];
  let chapters: RecordRow[] = [];
  let pageRows: RecordRow[] = [];
  try {
    volumes = rowsIfPresent(
      db,
      "db_manga_volumes",
      "SELECT * FROM db_manga_volumes WHERE series IN ('DB', 'DBFC', 'DBS', 'DBSFCJP') ORDER BY series, volume_number",
    );
    chapters = rowsIfPresent(
      db,
      "db_manga_chapters",
      "SELECT * FROM db_manga_chapters WHERE series IN ('DB', 'DBFC', 'DBS', 'DBSFCJP') ORDER BY series, chapter_number",
    );
    pageRows = rowsIfPresent(
      db,
      "db_manga_pages",
      "SELECT series, tome, planche, count(*) AS ocr_rows FROM db_manga_pages WHERE series IN ('DB', 'DBFC', 'DBS', 'DBSFCJP') GROUP BY series, tome, planche ORDER BY series, tome, planche",
    );
  } finally {
    db.close();
  }
  const catalogue = options.catalogue ? await Bun.file(options.catalogue).json() : null;
  const catalogueEntries: any[] = catalogueRecords(catalogue);
  const images = await walkImages(assetsRoot, catalogueCoverPaths(catalogueEntries, assetsRoot));
  const pageImages = images.filter((image) => image.role === "page");
  const records: RecordRow[] = [];
  for (const volume of volumes) {
    const series = String(volume.series);
    if (series === "DBS" || series === "DBSFCJP") continue;
    const key = `${series}:vol${Number(volume.volume_number)}`;
    const matched = pageImages.filter((image) => chapterOrVolume(image.path, series) === key);
    const textCount = pageRows.filter(
      (row) => row.series === series && row.tome === `t${Number(volume.volume_number)}`,
    ).length;
    records.push({
      series,
      edition:
        series === "DB"
          ? "Dragon Ball (format non précisé par ce snapshot de volumes)"
          : (EDITIONS[series] ?? "Dragon Ball"),
      unit: `vol${Number(volume.volume_number)}`,
      title: volume.title ?? "",
      isbn: volume.isbn ?? "",
      expectedPages: null,
      paginationStatus: "unknown-unless-explicit-catalogue-count",
      pageFiles: matched.length,
      pageScanPresence: matched.length ? "present" : "missing",
      pageHashesVerified: matched.length,
      ocrPageIndices: textCount,
      provenance:
        series === "DBFC"
          ? "SQLite chapter/volume records; Full Color volume mapping requires curated metadata"
          : "SQLite volume snapshot",
    });
  }
  for (const entry of catalogueEntries) {
    const volumeNumber = Number(entry.rang);
    const coverPath = entry.couverture?.chemin;
    const coverBasename =
      String(coverPath ?? "")
        .split("/")
        .at(-1) ?? "";
    const normalizedCoverPath = String(coverPath ?? "").replace(/^\.\//, "");
    const cover = coverPath
      ? images.find(
          (image) => image.path.endsWith(normalizedCoverPath) || image.path.endsWith(coverBasename),
        )
      : undefined;
    const pageCount = Number.isFinite(entry.planches_recensees)
      ? Number(entry.planches_recensees)
      : null;
    records.push({
      series: "DBCN",
      edition: "DragonballCN catalogue entry (bibliographic only)",
      unit: `vol${volumeNumber}`,
      title: entry.titre ?? "",
      isbn: entry.isbn ?? "",
      expectedPages: pageCount,
      paginationStatus:
        pageCount === null ? String(entry.pagination ?? "unknown") : "catalogue-count",
      coverPath: cover?.path ?? coverPath ?? null,
      coverPresent: Boolean(cover),
      coverSha256: cover?.sha256 ?? null,
      coverCatalogueSha256: entry.couverture?.sha256 ?? null,
      // Bibliographic identity does not establish a mapping to independently measured DBFC assets.
      pageFiles: 0,
      pageScanPresence: "missing",
      pageHashesVerified: 0,
      ocrPageIndices: null,
      provenance: entry.url_fiche ?? "DragonballCN catalogue record; not proof of page scans",
    });
  }
  for (let volumeNumber = 1; volumeNumber <= 24; volumeNumber++) {
    const key = `DBSFCJP:vol${volumeNumber}`;
    const matched = pageImages.filter((image) => chapterOrVolume(image.path, "DBSFCJP") === key);
    records.push({
      series: "DBSFCJP",
      edition: "Dragon Ball Super Color Edition (Japanese, Shueisha)",
      unit: `vol${volumeNumber}`,
      title: null,
      isbn: null,
      expectedPages: null,
      paginationStatus: "unknown-unless-explicit-source-manifest",
      source:
        "https://www.shueisha.co.jp/books/search/search.html?digital=1&titleauthor=%E3%82%B9%E3%83%BC",
      officialProductPage:
        volumeNumber === 2
          ? "https://www.shueisha.co.jp/books/items/contents.html?jdcn=08880867851831325501"
          : volumeNumber === 24
            ? "https://books.shueisha.co.jp/items/contents.html?jdcn=08X10000000063175100"
            : null,
      productPageVerified: volumeNumber === 2 || volumeNumber === 24,
      verifiedVolumeExamples: [2, 24],
      pageFiles: matched.length,
      pageScanPresence: matched.length ? "present" : "missing",
      pageHashesVerified: matched.length,
      ocrPageIndices: null,
      provenance:
        "Shueisha official catalog confirms color edition volumes 1–24; page-level assets not inferred",
    });
  }
  for (const chapter of chapters.filter(
    (item) => item.series === "DBS" || item.series === "DBSFCJP",
  )) {
    const series = String(chapter.series);
    const number = Number(chapter.chapter_number);
    const snapshotId = Number(chapter.id);
    const matched = pageImages.filter(
      (image) => chapterOrVolume(image.path, series) === `${series}:ch${snapshotId}`,
    );
    const pageKeys = new Set(
      pageRows
        .filter((row) => row.series === series && row.tome === `ch${Number(chapter.id)}`)
        .map((row) => Number(row.planche)),
    );
    records.push({
      series,
      edition:
        series === "DBSFCJP"
          ? "Dragon Ball Super Color Edition (Japanese, Shueisha)"
          : "Dragon Ball Super (monochrome chapters in local snapshot)",
      unit: `ch${number}`,
      title: chapter.title ?? "",
      expectedPages: null,
      paginationStatus: "unknown-unless-explicit-source-manifest",
      pageFiles: matched.length,
      pageScanPresence: matched.length ? "present" : "missing",
      pageHashesVerified: matched.length,
      ocrPageIndices: pageKeys.size,
      provenance: "SQLite chapter and OCR page-index rows",
    });
  }
  for (const chapter of chapters.filter((item) => item.series === "DBFC")) {
    const number = Number(chapter.chapter_number);
    const matched = pageImages.filter(
      (image) => chapterOrVolume(image.path, "DBFC") === `DBFC:ch${number}`,
    );
    const pageKeys = new Set(
      pageRows
        .filter((row) => row.series === "DBFC" && row.tome === `ch${Number(chapter.id)}`)
        .map((row) => Number(row.planche)),
    );
    records.push({
      series: "DBFC",
      edition: "DBFC (clé série; édition/provenance non qualifiée)",
      unit: `ch${number}`,
      title: chapter.title ?? "",
      expectedPages: null,
      paginationStatus: "unknown-unless-explicit-source-manifest",
      pageFiles: matched.length,
      pageScanPresence: matched.length ? "present" : "missing",
      pageHashesVerified: matched.length,
      ocrPageIndices: pageKeys.size,
      provenance: "SQLite chapter record; edition/page mapping unverified",
    });
  }
  const duplicateGroups = new Map<string, string[]>();
  for (const image of pageImages)
    duplicateGroups.set(image.sha256, [...(duplicateGroups.get(image.sha256) ?? []), image.path]);
  const duplicates = [...duplicateGroups]
    .filter(([, paths]) => paths.length > 1)
    .map(([sha256, paths]) => ({ sha256, paths }));
  const editionStatus = {
    DB: {
      publishedColorEditions: ["fr-couleur", "ja-couleur"],
      source: "apps/site/src/lib/manga-editions.ts",
    },
    DBFC: {
      seriesKey: true as const,
      officialEditionVerified: false as const,
      source: "apps/site/src/lib/manga-editions.ts",
      catalogueVolumeCount: catalogueEntries.length,
    },
    DBS: {
      publishedColorEdition: true,
      publishedEditions: ["fr-nb", "ja-nb", "ja-couleur"],
      source: "apps/site/src/lib/manga-editions.ts",
    },
    DBSFCJP: {
      publishedVolumes: 24,
      verifiedVolumes: [2, 24],
      source:
        "Shueisha official catalog: https://www.shueisha.co.jp/books/search/search.html?digital=1&titleauthor=%E3%82%B9%E3%83%BC",
    },
  };
  const result: MangaMatrixResult = {
    version: 1,
    inputs: {
      snapshot,
      assets: assetsRoot,
      catalogue: options.catalogue ? resolve(options.catalogue) : null,
    },
    editionStatus,
    totals: {
      records: records.length,
      imageFiles: images.length,
      pageImages: pageImages.length,
      covers: images.filter((image) => image.role === "cover").length,
      thumbnails: images.filter((image) => image.role === "thumbnail").length,
      unclassifiedImages: images.filter((image) => image.role === "unclassified").length,
      ocrPageIndexRows: pageRows.length,
      duplicatePageGroups: duplicates.length,
      decodeErrors: images.filter((image) => image.decodeError).length,
    },
    records,
    assets: images,
    duplicates,
    gaps: records.filter((record) => record.pageScanPresence === "missing"),
  };
  if (!options.plan) {
    await Bun.$`mkdir -p ${out}`.quiet();
    await Bun.write(resolve(out, "matrix.json"), `${JSON.stringify(result, null, 2)}\n`);
    const recordFields = [
      "series",
      "edition",
      "unit",
      "title",
      "isbn",
      "expectedPages",
      "paginationStatus",
      "coverPath",
      "coverPresent",
      "coverSha256",
      "coverCatalogueSha256",
      "pageFiles",
      "pageScanPresence",
      "pageHashesVerified",
      "ocrPageIndices",
      "provenance",
    ];
    const assetFields = [
      "path",
      "series",
      "role",
      "bytes",
      "sha256",
      "width",
      "height",
      "format",
      "decodeError",
    ];
    await Bun.write(
      resolve(out, "matrix.csv"),
      toCsv([[...recordFields], ...records.map((row) => recordFields.map((field) => row[field]))]),
    );
    await Bun.write(
      resolve(out, "assets.csv"),
      toCsv([
        [...assetFields],
        ...images.map((row) => assetFields.map((field) => (row as any)[field])),
      ]),
    );
  }
  return result;
}

if (import.meta.main) {
  try {
    const options = parseArgs(Bun.argv.slice(2));
    const result = await buildMangaColorMatrix(options);
    console.log(
      `${options.plan ? "Plan" : "Matrice créée"} : ${result.totals.records} lignes, ${result.totals.pageImages} planches mesurées, ${result.gaps.length} gaps; sortie ${resolve(options.out)}${options.plan ? " (aucune écriture)" : ""}`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
