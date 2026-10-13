// SPDX-License-Identifier: Apache-2.0
import { mkdir } from "node:fs/promises";
import { isAbsolute, join, resolve, relative } from "node:path";
import { readEditorialCollections } from "../../apps/site/src/lib/editorial-collections";

interface MetadataRecord {
  id?: number;
  series?: string;
  work?: string;
  language?: string;
  title?: string;
  page_count?: number;
}

const hash = (bytes: Uint8Array) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex");

/** Private evidence inventory: metadata never establishes a media asset or publishing grant. */
export async function inventoryEditorialCollections(root: string) {
  root = resolve(root);
  const bibliography = await Bun.file(
    join(root, "apps/bot/data/manga-bibliography-manifest.json"),
  ).json();
  const spinOffs = await Bun.file(join(root, "apps/bot/data/manga-spin-offs-manifest.json")).json();
  const snapshotFile = Bun.file(
    join(root, "var/reports/catalog-expansion/baseline-2026-10-11.json"),
  );
  const snapshot = (await snapshotFile.exists()) ? await snapshotFile.json() : null;
  const records = bibliography.records as MetadataRecord[];
  const volumes = (snapshot?.manga_volumes ?? []) as MetadataRecord[];
  const collectionRows = readEditorialCollections().collections.map((collection) => {
    const bibliographicRecords = records.filter((row) =>
      collection.matchWorks.includes(row.work ?? ""),
    );
    const snapshotPool =
      collection.kind === "anime"
        ? (snapshot?.episodes ?? [])
        : collection.kind === "manga"
          ? volumes
          : [];
    const snapshotRecords = (snapshotPool as MetadataRecord[]).filter((row) =>
      collection.matchSeries.includes(row.series ?? ""),
    );
    return {
      id: collection.id,
      requestedLanguages: collection.languages,
      requestedSubtitles: collection.subtitles,
      requestedColors: collection.colors,
      targetCount: collection.targetCount,
      currentBibliographicRecords: bibliographicRecords.length,
      bibliographicLanguages: Object.fromEntries(
        collection.languages.map((language) => [
          language,
          bibliographicRecords.filter((row) => row.language === language).length,
        ]),
      ),
      historicalSnapshotRecords: snapshotRecords.length,
      historicalSnapshotIds: snapshotRecords.map((row) => row.id),
      assetAvailability: "unverified",
      publicRehostingRights: "unverified",
      status:
        bibliographicRecords.length || snapshotRecords.length
          ? "metadata_present_assets_unverified"
          : "requested_inventory_gap",
    };
  });

  const transcripts: Array<{
    manifest: string;
    manifestSha256: string;
    records: number;
    transcriptFiles: Array<{
      path: string;
      exists: boolean;
      sha256: string | null;
      declaredHashes: string[];
      hashMatches: boolean | null;
    }>;
    partialOrDraft: boolean;
    reviewStatus: "unverified";
  }> = [];
  const directory = join(root, "data/catalogues/japanese-interviews");
  for await (const path of new Bun.Glob("*manifest.json").scan({ cwd: directory })) {
    const file = Bun.file(join(directory, path));
    const bytes = new Uint8Array(await file.arrayBuffer());
    const metadata = JSON.parse(new TextDecoder().decode(bytes));
    const rows = Array.isArray(metadata.records) ? metadata.records : [];
    const refs = new Map<string, Set<string>>();
    for (const row of rows) {
      if (typeof row.transcriptPath !== "string") continue;
      const ref = row.transcriptPath.split("#")[0].replaceAll("\\", "/");
      // Ignore historical host paths, traversal and other protected stores.
      if (
        !ref.startsWith("data/catalogues/japanese-interviews/") ||
        isAbsolute(ref) ||
        ref.split("/").includes("..")
      )
        continue;
      const hashes = refs.get(ref) ?? new Set<string>();
      // Aggregate manifests can carry hashes of original files or individual rows.
      // Their #L fragment cannot establish the hash of the aggregate JSONL file.
      for (const declared of row.transcriptPath.includes("#")
        ? []
        : [row.transcriptSha256, metadata.transcriptSha256]) {
        if (typeof declared === "string" && /^[a-f0-9]{64}$/i.test(declared))
          hashes.add(declared.toLowerCase());
      }
      refs.set(ref, hashes);
    }
    const transcriptFiles = [];
    for (const [ref, hashes] of refs) {
      const transcript = Bun.file(join(root, ref));
      const exists = await transcript.exists();
      const sha256 = exists ? hash(new Uint8Array(await transcript.arrayBuffer())) : null;
      transcriptFiles.push({
        path: ref,
        exists,
        sha256,
        declaredHashes: [...hashes],
        hashMatches: hashes.size && sha256 ? hashes.has(sha256) : null,
      });
    }
    const notes = JSON.stringify({
      completeness: rows.map((row: { completeness?: unknown }) => row.completeness),
      reviewNotes: metadata.reviewNotes,
    });
    transcripts.push({
      manifest: `data/catalogues/japanese-interviews/${path}`,
      manifestSha256: hash(bytes),
      records: rows.length,
      transcriptFiles,
      partialOrDraft: /partial|draft|omitted|needs.*review|need.*review|incomplete/i.test(notes),
      reviewStatus: "unverified",
    });
  }
  transcripts.sort((left, right) => left.manifest.localeCompare(right.manifest));
  return {
    schema: "shenron-editorial-collection-inventory/v1",
    observedAt: new Date().toISOString(),
    scope: "local-bibliography-and-transcript-file-integrity",
    completeCoverage: false,
    noMutation: true,
    snapshot: snapshot
      ? {
          observedAt: snapshot.observed_at,
          current: false,
          sha256: hash(new Uint8Array(await snapshotFile.arrayBuffer())),
        }
      : null,
    collections: collectionRows,
    bibliographyRecords: records.length,
    spinOffBibliographicRecords: spinOffs.works.length,
    transcriptManifests: transcripts,
    transcriptManifestCount: transcripts.length,
    partialOrDraftManifestCount: transcripts.filter((row) => row.partialOrDraft).length,
    transcriptFileCount: new Set(
      transcripts.flatMap((row) =>
        row.transcriptFiles.filter((file) => file.exists).map((file) => file.path),
      ),
    ).size,
    hashMismatchCount: transcripts
      .flatMap((row) => row.transcriptFiles)
      .filter((file) => file.hashMatches === false).length,
    omissions: [
      "live PostgreSQL inventory",
      "live R2 asset integrity",
      "media playback",
      "publishing grants",
      "Japanese transcript linguistic review",
      "complete issue/chapter pagination",
      "exhaustive official/YouTube interviews",
    ],
  };
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, "../..");
  const output = resolve(
    root,
    process.argv[2] ?? "var/reports/editorial-collections/inventory.json",
  );
  const reportDirectory = join(root, "var/reports");
  const reportRelative = relative(reportDirectory, output);
  if (reportRelative.startsWith("..") || isAbsolute(reportRelative))
    throw new Error("Inventory output must stay in private var/reports");
  const report = await inventoryEditorialCollections(root);
  await mkdir(resolve(output, ".."), { recursive: true });
  await Bun.write(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify({
      output,
      collections: report.collections.length,
      transcriptManifests: report.transcriptManifestCount,
      transcriptFiles: report.transcriptFileCount,
      hashMismatches: report.hashMismatchCount,
      completeCoverage: false,
    }),
  );
}
