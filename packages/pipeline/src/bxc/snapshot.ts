// SPDX-License-Identifier: Apache-2.0
/** One read-only snapshot owner, shared by Node and native acquisition consumers. */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { homedir } from "node:os";
import {
  DbcnVolumeItemSchema,
  DbcnVolumeInfoSchema,
  DbcnSinglePageViewSchema,
  type DbcnCatalogCategory,
  type DbcnVolumeItem,
  type DbcnVolumeInfo,
  type DbcnSinglePageView,
} from "./contracts";
import type { BxcSpawnOptions } from "./types";

type SnapshotPage = {
  n: number;
  fichier: string;
  poids: string | null;
  image_url?: string | null;
  thumb_url?: string | null;
};
type SnapshotVolume = {
  did: string;
  titre: string | null;
  url_fiche: string;
  premiere_edition: string | null;
  couverture: { source_url: string } | null;
};
type SnapshotCollection = { slug: string; titre: string; ouvrages: SnapshotVolume[] };
type CatalogueSnapshot = { collections: SnapshotCollection[] };

const CATEGORY_TO_COLLECTION: Record<Exclude<DbcnCatalogCategory, "all">, string> = {
  full_color: "dragonball_full_color",
  jp_original: "dragonball_jp_original",
  zh_cn: "dragonball_zh_cn",
  zh_hk: "dragonball_zh_hk_ultimate",
  taiwan: "dragonball_zh_tw",
  kanzenban: "dragonball_jp_kanzenban",
  anime_movie: "dragonball_anime_movie",
  anime_z: "dragonball_anime_z",
  arale_cn: "arale_cn",
  arale_jp: "arale_jp_lib",
  arale_hk: "arale_zh_hk",
};

export function nativeSnapshotRoot(): string {
  const crawlDir =
    process.env.APHRODY_CORPUS_CRAWL_DIR?.trim() ||
    resolve(
      process.env.APHRODY_HOME?.trim() || resolve(homedir(), ".aphrody"),
      "workspaces/dbfr/crawl",
    );
  return resolve(crawlDir, "corpus");
}

function snapshotPath(fileName: string, root?: string): string {
  if (root) return resolve(root, fileName);
  const configured = process.env.DRAGONBALLCN_SNAPSHOT_DIR?.trim();
  if (configured) return resolve(configured, fileName);

  const candidates = [
    resolve(nativeSnapshotRoot(), fileName),
    resolve(process.cwd(), "apps/bot", fileName),
    resolve(process.cwd(), "../apps/bot", fileName),
    // apps/site runs with cwd = apps/site (systemd WorkingDirectory): the bot is a sibling.
    resolve(process.cwd(), "../bot", fileName),
  ];
  const existing = candidates.find((candidate) => existsSync(candidate));
  if (existing) return existing;
  throw new Error(
    "DragonBallCN snapshot not found. Set DRAGONBALLCN_SNAPSHOT_DIR to the directory containing assets/dragonballcn and data/catalogues.",
  );
}

async function readSnapshot(root?: string): Promise<{
  catalogue: CatalogueSnapshot;
  pages: Record<string, SnapshotPage[]>;
}> {
  const readJson = async (path: string): Promise<unknown> =>
    JSON.parse(await readFile(snapshotPath(path, root), "utf8"));
  const [catalogue, pages] = await Promise.all([
    readJson("assets/dragonballcn/index.json") as Promise<CatalogueSnapshot>,
    readJson("data/catalogues/dragonballcn-inventaire.json") as Promise<
      Record<string, SnapshotPage[]>
    >,
  ]);
  return { catalogue, pages };
}

function collectionFor(
  category: DbcnCatalogCategory,
  collections: SnapshotCollection[],
): SnapshotCollection[] {
  if (category === "all") return collections;
  const slug = CATEGORY_TO_COLLECTION[category];
  return collections.filter((collection) => collection.slug === slug);
}

function categoryFor(collection: SnapshotCollection): string {
  return (
    Object.entries(CATEGORY_TO_COLLECTION).find(([, slug]) => slug === collection.slug)?.[0] ??
    collection.slug
  );
}

/**
 * Compatibility reader for the retired `bxc dragonballcn` CLI.
 *
 * BXC 0.9.13 provides `bxc dragonball`, a different official-source crawl; it
 * has no DragonBallCN catalog/info/view API. The versioned DragonBallCN snapshot
 * is therefore authoritative for this legacy surface. It contains bibliographic
 * metadata and enumerated filenames only. Direct image URLs are exposed when
 * the snapshot provides them; otherwise the public fiche URL remains available.
 */
export class DragonballCnSnapshotService {
  async catalog(
    category: DbcnCatalogCategory = "full_color",
    _options?: BxcSpawnOptions,
    snapshotRoot?: string,
  ): Promise<DbcnVolumeItem[]> {
    const { catalogue } = await readSnapshot(snapshotRoot);
    return collectionFor(category, catalogue.collections).flatMap((collection) =>
      collection.ouvrages.map((volume) =>
        DbcnVolumeItemSchema.parse({
          id: volume.did,
          title: volume.titre ?? volume.did,
          category: categoryFor(collection),
          categoryTitle: collection.titre,
          coverUrl: volume.couverture?.source_url,
          url: volume.url_fiche,
          date: volume.premiere_edition ?? undefined,
        }),
      ),
    );
  }

  async info(did: string, _options?: BxcSpawnOptions): Promise<DbcnVolumeInfo> {
    const trimmed = did.trim();
    if (!trimmed) throw new Error("Volume DID is required (e.g. '0-10-1')");

    const { catalogue, pages } = await readSnapshot();
    const volume = catalogue.collections
      .flatMap((collection) => collection.ouvrages)
      .find((item) => item.did === trimmed);
    if (!volume)
      throw new Error(`DragonBallCN volume not found in the versioned snapshot: ${trimmed}`);

    const entries = pages[trimmed] ?? [];
    return DbcnVolumeInfoSchema.parse({
      id: volume.did,
      title: volume.titre ?? volume.did,
      totalPages: entries.length,
      pages: entries.map((page) => ({
        pageNumber: page.n,
        name: page.fichier,
        size: page.poids ?? undefined,
        thumbUrl: page.thumb_url ?? "",
        imageUrl: page.image_url ?? "",
        pageUrl: volume.url_fiche,
      })),
    });
  }

  async view(
    did: string,
    pageNumber?: number,
    _options?: BxcSpawnOptions,
  ): Promise<DbcnVolumeInfo | DbcnSinglePageView> {
    const volume = await this.info(did);
    if (pageNumber === undefined) return volume;
    if (!Number.isInteger(pageNumber) || pageNumber < 1)
      throw new Error("Page number must be a positive integer");
    const page = volume.pages.find((item) => item.pageNumber === pageNumber);
    if (!page) throw new Error(`Page ${pageNumber} not found in DragonBallCN volume ${volume.id}`);
    return DbcnSinglePageViewSchema.parse(page);
  }
}
