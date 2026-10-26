// SPDX-License-Identifier: Apache-2.0

export type PrimaryTechniqueArtwork = {
  image: string;
  icon: string;
  medium: "manga" | "anime";
  source: { label: string; url: string; provenance: "dbfc-colorization" };
};

export type TechniqueArtwork =
  | PrimaryTechniqueArtwork
  | {
      image: string;
      icon: null;
      medium: "editorial";
      source: null;
    };

function mangaArtwork(slug: string, chapter: number, page: number): PrimaryTechniqueArtwork {
  return {
    image: `/techniques/${slug}.webp`,
    icon: `/techniques/${slug}.svg`,
    medium: "manga",
    source: {
      label: `DBFC ${chapter} · ${page}`,
      url: `https://dragonballfr.com/wiki/manga/${20000 + chapter}?page=${page}`,
      provenance: "dbfc-colorization",
    },
  };
}

/** Exact technique scenes inspected before publication; never inferred from a creator portrait. */
export const TECHNIQUE_ARTWORK: Readonly<Record<string, PrimaryTechniqueArtwork>> = Object.freeze({
  kamehameha: mangaArtwork("kamehameha", 14, 13),
  genkidama: mangaArtwork("genkidama", 212, 4),
  kienzan: mangaArtwork("kienzan", 221, 9),
  makankosappo: mangaArtwork("makankosappo", 202, 3),
  "final-flash": mangaArtwork("final-flash", 384, 11),
  "shin-kikoho": mangaArtwork("shin-kikoho", 373, 13),
  "morsure-du-soleil": mangaArtwork("morsure-du-soleil", 124, 6),
  "big-bang": mangaArtwork("big-bang", 344, 13),
  kikoho: mangaArtwork("kikoho", 133, 5),
  mafuba: mangaArtwork("mafuba", 146, 8),
  dodompa: mangaArtwork("dodompa", 121, 3),
  kaioken: mangaArtwork("kaioken", 226, 13),
  teleportation: mangaArtwork("teleportation", 336, 4),
  "canon-garric": mangaArtwork("canon-garric", 231, 10),
  masenko: mangaArtwork("masenko", 223, 9),
  "beignets-galactiques": mangaArtwork("beignets-galactiques", 490, 7),
  "kamehameha-teleporte": mangaArtwork("kamehameha-teleporte", 401, 4),
  "super-kamehameha": mangaArtwork("super-kamehameha", 185, 1),
  sokidan: mangaArtwork("sokidan", 175, 9),
  "attaque-volley-ball": mangaArtwork("attaque-volley-ball", 129, 3),
  "technique-du-loup": mangaArtwork("technique-du-loup", 10, 11),
  "image-remanente": mangaArtwork("image-remanente", 48, 6),
  "super-fantomes-kamikazes": mangaArtwork("super-fantomes-kamikazes", 491, 2),
  "explosion-finale": mangaArtwork("explosion-finale", 467, 11),
  "grenade-infernale": mangaArtwork("grenade-infernale", 367, 11),
  "kamehameha-pere-fils": mangaArtwork("kamehameha-pere-fils", 416, 7),
  "boule-de-la-mort": mangaArtwork("boule-de-la-mort", 316, 5),
  "super-vegeta": mangaArtwork("super-vegeta", 378, 15),
  "super-saiyen": mangaArtwork("super-saiyen", 319, 10),
  "super-saiyen-2": mangaArtwork("super-saiyen-2", 408, 2),
  "super-saiyen-3": mangaArtwork("super-saiyen-3", 509, 13),
  "baton-magique": mangaArtwork("baton-magique", 1, 32),
  "rayon-oculaire": mangaArtwork("rayon-oculaire", 210, 4),
  "echange-des-corps": mangaArtwork("echange-des-corps", 286, 15),
  "super-genkidama": mangaArtwork("super-genkidama", 514, 13),
  "kaioken-kamehameha-x4": mangaArtwork("kaioken-kamehameha-x4", 231, 16),
  "kaioken-kamehameha-x20": mangaArtwork("kaioken-kamehameha-x20", 313, 13),
  autodestruction: mangaArtwork("autodestruction", 217, 13),
  geant: mangaArtwork("geant", 186, 12),
  "dynamite-kick": mangaArtwork("dynamite-kick", 396, 13),
});

export function getTechniqueArtwork(slug: string): PrimaryTechniqueArtwork | null {
  return Object.hasOwn(TECHNIQUE_ARTWORK, slug) ? TECHNIQUE_ARTWORK[slug]! : null;
}

/** Existing database images require the same review as new images before they become attack artwork. */
export function resolveTechniqueArtwork(technique: {
  id?: number;
  slug: string;
  image?: string | null;
  creatorImage?: string | null;
}): TechniqueArtwork | null {
  const value = technique.image?.trim();
  if (value) {
    try {
      const url = new URL(value.replace(/^\.\//, "/"), "https://dragonballfr.com");
      // Only new dedicated editorial uploads can override a reviewed static scene.
      // This namespace is a storage identity, not proof of manga/anime provenance.
      if (
        url.protocol === "https:" &&
        ["dragonballfr.com", "bot.dragonballfr.com", "cdn.dragonballfr.com"].includes(
          url.hostname,
        ) &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        /^\/assets\/wiki\/techniques\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(png|jpg|webp|gif)$/.test(
          url.pathname,
        )
      )
        return { image: value, icon: null, medium: "editorial", source: null };
    } catch {
      /* An invalid media URL cannot replace reviewed artwork. */
    }
  }
  return getTechniqueArtwork(technique.slug);
}
