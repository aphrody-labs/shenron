// SPDX-License-Identifier: Apache-2.0
export type SceneMascotAsset = {
  id: "goku" | "kid-buu" | "shenron";
  format: "raster" | "vector";
  src: string;
  sourceUrl: string;
  sourceLabel: string;
  sourcePage?: string;
  sha256?: string;
  width: number;
  height: number;
  x: number;
  y: number;
  displayHeight: number;
};

/** Full-body illustrations. Raster sources are never described as vector drawings. */
export const SCENE_MASCOTS: readonly SceneMascotAsset[] = [
  {
    id: "goku",
    format: "raster",
    src: "/wiki-scene/goku-kai.png",
    sourceUrl: "https://www.toei-anim.co.jp/tv/dragon_kai/character/img/1/imgChara.png",
    sourcePage: "https://www.toei-anim.co.jp/tv/dragon_kai/character/",
    sha256: "addd845e503d035ae52288a5fab68a4a481840a01c92b6cf868f36a0a28f53c0",
    sourceLabel: "Toei Animation — Dragon Ball Kai",
    width: 326,
    height: 590,
    x: 540,
    y: 1035,
    displayHeight: 260,
  },
  {
    id: "kid-buu",
    format: "raster",
    src: "/wiki-scene/kid-buu-fighterz.png",
    sourceUrl: "https://dba.bn-ent.net/character/images/majinBoo/portrait.png",
    sourcePage: "https://dba.bn-ent.net/character/majinboo.html",
    sha256: "72b26a82de0500ab0a08288e9f576781c4e5c140fac6feb66f72480bf902a3f0",
    sourceLabel: "Bandai Namco — Dragon Ball FighterZ",
    width: 512,
    height: 939,
    x: 1590,
    y: 1125,
    displayHeight: 275,
  },
  {
    id: "shenron",
    format: "raster",
    src: "/wiki-scene/shenron-dokkan.png",
    sourceUrl: "https://static.wixstatic.com/media/199f29_6c8f6e5d3d0f48819fe781d7b6975c08~mv2.png",
    sourcePage: "https://www.xenofrance.fr/shenron",
    sha256: "8af30dcc9884191b7ce51d28ca3cea9741f29472bfba50ed86ffe89dce56861b",
    sourceLabel: "XenoFrance · Maxiuchiha22 — Dokkan Battle",
    width: 800,
    height: 560,
    x: 1550,
    y: 500,
    displayHeight: 320,
  },
];
