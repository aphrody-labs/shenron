// SPDX-License-Identifier: Apache-2.0
import {
  DB_KANZENBAN_JP,
  DB_FULL_COLOR,
  DBZ_ANIME_Z,
  DB_ANIME_MOVIE,
  HK_ULTIMATE_MISSING,
  ARALE_HK_ISBNS,
  DB_ZH_TW_ISBNS,
  DIVERS_METADATA,
} from "./edition-metadata";

export interface CatalogueVolume {
  did: string;
  couverture?: string;
  isbn?: string;
  parution?: string;
  date_affichee?: string;
  titre_fr?: string;
  titre_ja?: string;
  premiere_edition?: string;
  [key: string]: unknown;
}
export interface CatalogueCollection {
  slug: string;
  ouvrages: CatalogueVolume[];
  [key: string]: unknown;
}
export interface DragonBallCatalogue {
  collections: CatalogueCollection[];
  totaux?: { planches?: number; [key: string]: unknown };
  [key: string]: unknown;
}

export function validateCatalogue(value: unknown): DragonBallCatalogue {
  if (
    !value ||
    typeof value !== "object" ||
    !("collections" in value) ||
    !Array.isArray(value.collections)
  )
    throw new Error("Invalid Dragon Ball catalogue");
  for (const collection of value.collections)
    if (
      !collection ||
      typeof collection.slug !== "string" ||
      !Array.isArray(collection.ouvrages) ||
      collection.ouvrages.some(
        (volume: unknown) =>
          !volume ||
          typeof volume !== "object" ||
          !("did" in volume) ||
          typeof volume.did !== "string",
      )
    )
      throw new Error("Invalid Dragon Ball catalogue collection");
  return value as DragonBallCatalogue;
}
/** Applies the existing edition metadata without mutating the input or writing editorial stores. */
export function enrichCatalogue(input: unknown): DragonBallCatalogue {
  const catalogue = structuredClone(validateCatalogue(input));
  // Traitement par collection
  for (const col of catalogue.collections) {
    if (col.slug === "dragonball_jp_kanzenban") {
      col.ouvrages.forEach((o: CatalogueVolume, idx: number) => {
        const m = DB_KANZENBAN_JP[idx];
        if (m) {
          o.isbn = m.isbn;
          if (!o.parution) o.parution = m.date;
          if (!o.date_affichee) o.date_affichee = m.date;
        }
      });
    } else if (col.slug === "dragonball_full_color") {
      col.ouvrages.forEach((o: CatalogueVolume, idx: number) => {
        const m = DB_FULL_COLOR[idx];
        if (m) {
          o.isbn = m.isbn;
          if (!o.parution) o.parution = m.date;
          if (!o.date_affichee) o.date_affichee = m.date;
        }
      });
    } else if (col.slug === "dragonball_anime_z") {
      col.ouvrages.forEach((o: CatalogueVolume, idx: number) => {
        const m = DBZ_ANIME_Z[idx];
        if (m) {
          o.isbn = m.isbn;
          if (!o.parution) o.parution = m.date;
          if (!o.date_affichee) o.date_affichee = m.date;
        }
      });
    } else if (col.slug === "dragonball_anime_movie") {
      col.ouvrages.forEach((o: CatalogueVolume, idx: number) => {
        const m = DB_ANIME_MOVIE[idx];
        if (m) {
          o.isbn = m.isbn;
          if (!o.parution) o.parution = m.date;
          if (!o.date_affichee) o.date_affichee = m.date;
        }
      });
    } else if (col.slug === "dragonball_zh_hk_ultimate") {
      col.ouvrages.forEach((o: CatalogueVolume) => {
        if (HK_ULTIMATE_MISSING[o.did]) {
          o.isbn = HK_ULTIMATE_MISSING[o.did];
        }
      });
    } else if (col.slug === "arale_zh_hk") {
      col.ouvrages.forEach((o: CatalogueVolume) => {
        if (ARALE_HK_ISBNS[o.did]) {
          o.isbn = ARALE_HK_ISBNS[o.did];
        }
      });
    } else if (col.slug === "dragonball_zh_tw") {
      col.ouvrages.forEach((o: CatalogueVolume, idx: number) => {
        if (DB_ZH_TW_ISBNS[idx]) {
          o.isbn = DB_ZH_TW_ISBNS[idx];
        }
      });
    } else if (col.slug === "divers") {
      col.ouvrages.forEach((o: CatalogueVolume) => {
        const meta = DIVERS_METADATA[o.did];
        if (meta) {
          if (meta.cover) o.couverture = meta.cover;
          if (meta.isbn) o.isbn = meta.isbn;
          if (meta.parution && !o.parution) o.parution = meta.parution;
          if (meta.parution && !o.date_affichee) o.date_affichee = meta.parution;
          if (meta.titre_fr) o.titre_fr = meta.titre_fr;
          if (meta.titre_ja) o.titre_ja = meta.titre_ja;
        }
      });
    }
  }

  // Recalcul des totaux
  let nbCouverturesApres = 0;
  let nbIsbnApres = 0;
  let nbOuvragesTotal = 0;
  for (const col of catalogue.collections) {
    nbOuvragesTotal += col.ouvrages.length;
    for (const o of col.ouvrages) {
      if (o.couverture) nbCouverturesApres++;
      if (o.isbn) nbIsbnApres++;
    }
  }

  catalogue.totaux = {
    collections: catalogue.collections.length,
    ouvrages: nbOuvragesTotal,
    planches: catalogue.totaux?.planches ?? 0,
    avec_couverture: nbCouverturesApres,
    avec_isbn: nbIsbnApres,
  };

  return catalogue;
}
