// SPDX-License-Identifier: Apache-2.0
import { HOME_HERO_FRAMES } from "@/lib/home-hero-frames";

/** Inspected episode stills: the 240s frame contains subtitles and is deliberately excluded. */
export const PORTAL_ANIME_FRAMES = HOME_HERO_FRAMES.filter(
  (frame) => !(frame.episodeId === 876 && frame.timecodeSec === 240),
);

/** Faithful raster artwork; these files are not vector illustrations or open-licensed originals. */
export const PORTAL_MASCOTS = [
  {
    id: "goku",
    src: "/wiki-scene/goku-kai.png",
    width: 326,
    height: 590,
    source: "https://www.toei-anim.co.jp/tv/dragon_kai/character/",
    sha256: "addd845e503d035ae52288a5fab68a4a481840a01c92b6cf868f36a0a28f53c0",
  },
  {
    id: "kid-buu",
    src: "/wiki-scene/kid-buu-fighterz.png",
    width: 512,
    height: 939,
    source: "https://dba.bn-ent.net/character/majinboo.html",
    sha256: "72b26a82de0500ab0a08288e9f576781c4e5c140fac6feb66f72480bf902a3f0",
  },
  {
    id: "shenron",
    src: "/wiki-scene/shenron-dokkan.png",
    width: 800,
    height: 560,
    source: "https://www.xenofrance.fr/shenron",
    sha256: "8af30dcc9884191b7ce51d28ca3cea9741f29472bfba50ed86ffe89dce56861b",
  },
] as const;
