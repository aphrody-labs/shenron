// SPDX-License-Identifier: Apache-2.0

export type PrimaryTechniqueArtwork = {
  image: string;
  icon: string;
  medium: "manga" | "anime";
  source: { label: string; url: string };
};

export type TechniqueArtwork =
  | PrimaryTechniqueArtwork
  | {
      image: string;
      icon: null;
      medium: "editorial";
      source: null;
    };

function mangaArtwork(slug: string, volume: number, page: number): PrimaryTechniqueArtwork {
  return {
    image: `/techniques/${slug}.webp`,
    icon: `/techniques/${slug}.svg`,
    medium: "manga",
    source: {
      label: `Dragon Ball · ${volume} · ${page}`,
      url: `https://dragonballfr.com/wiki/manga/${1419 + volume}?page=${page}`,
    },
  };
}

/** Exact technique scenes inspected before publication; never inferred from a creator portrait. */
export const TECHNIQUE_ARTWORK: Readonly<Record<string, PrimaryTechniqueArtwork>> = Object.freeze({
  kamehameha: mangaArtwork("kamehameha", 2, 13),
  genkidama: mangaArtwork("genkidama", 18, 81),
  kienzan: mangaArtwork("kienzan", 19, 41),
  makankosappo: mangaArtwork("makankosappo", 17, 110),
  "final-flash": mangaArtwork("final-flash", 32, 133),
  "shin-kikoho": mangaArtwork("shin-kikoho", 31, 136),
  "morsure-du-soleil": mangaArtwork("morsure-du-soleil", 11, 6),
  "big-bang": mangaArtwork("big-bang", 29, 45),
  kikoho: mangaArtwork("kikoho", 11, 142),
  mafuba: mangaArtwork("mafuba", 12, 175),
  dodompa: mangaArtwork("dodompa", 10, 125),
  kaioken: mangaArtwork("kaioken", 19, 120),
  teleportation: mangaArtwork("teleportation", 28, 100),
  "canon-garric": mangaArtwork("canon-garric", 20, 10),
  masenko: mangaArtwork("masenko", 19, 71),
  "beignets-galactiques": mangaArtwork("beignets-galactiques", 41, 61),
  "kamehameha-teleporte": mangaArtwork("kamehameha-teleporte", 34, 51),
  "super-kamehameha": mangaArtwork("super-kamehameha", 16, 33),
  sokidan: mangaArtwork("sokidan", 15, 71),
  "attaque-volley-ball": mangaArtwork("attaque-volley-ball", 11, 80),
  "technique-du-loup": mangaArtwork("technique-du-loup", 1, 173),
  "image-remanente": mangaArtwork("image-remanente", 4, 115),
  "super-fantomes-kamikazes": mangaArtwork("super-fantomes-kamikazes", 41, 69),
  "explosion-finale": mangaArtwork("explosion-finale", 39, 103),
  "grenade-infernale": mangaArtwork("grenade-infernale", 31, 43),
  "kamehameha-pere-fils": mangaArtwork("kamehameha-pere-fils", 35, 109),
  "boule-de-la-mort": mangaArtwork("boule-de-la-mort", 26, 155),
  "super-vegeta": mangaArtwork("super-vegeta", 32, 47),
  "super-saiyen": mangaArtwork("super-saiyen", 27, 27),
  "super-saiyen-2": mangaArtwork("super-saiyen-2", 34, 155),
  "super-saiyen-3": mangaArtwork("super-saiyen-3", 42, 93),
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
