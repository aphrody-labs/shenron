// SPDX-License-Identifier: Apache-2.0
import atlas from "./archive-atlas.json";

export type SceneTextureFrame = { x: number; y: number; w: number; h: number };
export const SCENE_TEXTURE_SHEETS = {
  archives: {
    src: "/wiki-scene/archive-atlas.png",
    width: atlas.meta.size.w,
    height: atlas.meta.size.h,
    format: "raster",
    sha256: "4ace1678ddaccfa76bb0ffc18d76c9976dd0293952f6b206e001b284711b6273",
    sourceUrl: "https://dragonballfr.com/wiki/episodes/876",
    sourceLabel: "Dragon Ball Super · 876",
    receiptSha256: "28aceb57b8102ef56ddf882bb0032b46103d053a5be860b8b2b526957224381e",
  },
  clouds: {
    src: "/wiki-scene/clouds-cc0.svg",
    width: 1024,
    height: 1024,
    format: "vector",
    sha256: "3984fcf062f50ba1cebe662d8bb1a335124ccd63453d177bdffbc084ed74e28d",
    sourceUrl: "https://opengameart.org/content/vector-clouds",
    sourceLabel: "Modanung & Sam · CC0",
  },
  hourglasses: {
    src: "/wiki-scene/hourglasses-875.webp",
    width: 960,
    height: 540,
    format: "raster",
    sha256: "ea15c3ed628c38c11f899fa8bd2ba363841c7b21a6a6c5524d810c7e765c3e51",
    sourceUrl: "https://dragonballfr.com/wiki/episodes/875",
    sourceLabel: "Dragon Ball Super · 875 · 119.994875 s",
    videoSha256: "db6b365d58a933a18176ffd848b23d79513acb899acf7b4a07bd35203949508e",
  },
} as const;

export type SceneTextureSheetId = keyof typeof SCENE_TEXTURE_SHEETS;
export type SceneMediaPlacement = {
  id: string;
  sheet: SceneTextureSheetId;
  frame: SceneTextureFrame;
  left: number;
  top: number;
  width: number;
  height: number;
  depth: number;
  overviewOnly?: boolean;
  clip?: "ellipse";
};

/** A source photogram is framed within the archive colonnade; no cut-out or repainting. */
export const SCENE_BACKDROPS: readonly SceneMediaPlacement[] = [
  {
    id: "hourglass-archive",
    sheet: "hourglasses",
    frame: { x: 0, y: 0, w: 960, h: 540 },
    left: 1400,
    top: 210,
    width: 280,
    height: 157.5,
    depth: 0.06,
  },
];

/** Genuine vector source, clipped into two cloud regions. GPU preparation rasterizes it as a texture. */
export const SCENE_CLOUDS: readonly SceneMediaPlacement[] = [
  {
    id: "cloud-west",
    sheet: "clouds",
    frame: { x: 0, y: 0, w: 512, h: 256 },
    left: 0,
    top: -20,
    width: 520,
    height: 260,
    depth: 0.13,
  },
  {
    id: "cloud-east",
    sheet: "clouds",
    frame: { x: 512, y: 0, w: 512, h: 256 },
    left: 1700,
    top: 35,
    width: 480,
    height: 240,
    depth: 0.13,
  },
];

/** Source stills in the travel journal retain their original subtitles and aspect ratio. */
export const SCENE_ARCHIVE_STILLS: readonly (Pick<SceneMediaPlacement, "sheet" | "frame"> & {
  id: string;
  href: string;
})[] = [
  {
    id: "kaioshin-memory",
    sheet: "archives",
    frame: atlas.frames["kaioshin-background"].frame,
    href: "/wiki/episodes/876",
  },
  {
    id: "beerus-memory",
    sheet: "archives",
    frame: atlas.frames["beerus-background"].frame,
    href: "/wiki/episodes/876",
  },
];

export function sceneTextureCrop(placement: Pick<SceneMediaPlacement, "sheet" | "frame">) {
  const sheet = SCENE_TEXTURE_SHEETS[placement.sheet];
  return {
    backgroundImage: `url("${sheet.src}")`,
    backgroundSize: `${(sheet.width / placement.frame.w) * 100}% ${(sheet.height / placement.frame.h) * 100}%`,
    backgroundPosition: `${(placement.frame.x / Math.max(1, sheet.width - placement.frame.w)) * 100}% ${(placement.frame.y / Math.max(1, sheet.height - placement.frame.h)) * 100}%`,
  };
}
