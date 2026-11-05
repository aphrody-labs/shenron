// SPDX-License-Identifier: Apache-2.0
export type WikiSceneRegion = "earth" | "namek" | "capsule" | "archives";
export type WikiSceneView = WikiSceneRegion | "atlas";
export type WikiSceneCategory = {
  id: string;
  href: string;
  countKey?: string;
  region: WikiSceneRegion;
  x: number;
  y: number;
};

/** Equal navigation entries, positioned around landmarks rather than ranked by collection size. */
export const WIKI_SCENE_CATEGORIES: readonly WikiSceneCategory[] = [
  {
    id: "characters",
    href: "/wiki/characters",
    countKey: "characters",
    region: "earth",
    x: 260,
    y: 660,
  },
  {
    id: "techniques",
    href: "/wiki/techniques",
    countKey: "techniques",
    region: "earth",
    x: 635,
    y: 695,
  },
  {
    id: "events",
    href: "/wiki/events",
    countKey: "timelineEvents",
    region: "earth",
    x: 210,
    y: 920,
  },
  { id: "movies", href: "/wiki/movies", countKey: "movies", region: "earth", x: 655, y: 960 },
  {
    id: "episodes",
    href: "/wiki/episodes",
    countKey: "episodes",
    region: "earth",
    x: 420,
    y: 1120,
  },
  { id: "games", href: "/wiki/games", countKey: "games", region: "earth", x: 790, y: 1140 },
  { id: "races", href: "/wiki/races", countKey: "races", region: "namek", x: 1260, y: 700 },
  {
    id: "transformations",
    href: "/wiki/transformations",
    countKey: "transformations",
    region: "namek",
    x: 1740,
    y: 695,
  },
  {
    id: "locations",
    href: "/wiki/locations",
    countKey: "locations",
    region: "namek",
    x: 1220,
    y: 950,
  },
  { id: "sagas", href: "/wiki/sagas", countKey: "sagas", region: "namek", x: 1780, y: 970 },
  { id: "arcs", href: "/wiki/arcs", countKey: "arcs", region: "namek", x: 1390, y: 1110 },
  {
    id: "dragons",
    href: "/wiki/characters#dragons-personnages",
    countKey: "dragons",
    region: "namek",
    x: 1810,
    y: 1150,
  },
  { id: "items", href: "/wiki/items", countKey: "items", region: "capsule", x: 240, y: 245 },
  {
    id: "power-levels",
    href: "/wiki/power-levels",
    countKey: "powerLevels",
    region: "capsule",
    x: 770,
    y: 260,
  },
  {
    id: "cards",
    href: "/wiki/cards",
    countKey: "cardCatalogCards",
    region: "capsule",
    x: 240,
    y: 470,
  },
  { id: "gifs", href: "/wiki/gifs", region: "capsule", x: 780, y: 475 },
  { id: "tools", href: "/wiki/tools", countKey: "tools", region: "capsule", x: 520, y: 400 },
  { id: "music", href: "/wiki/music", countKey: "soundtracks", region: "capsule", x: 850, y: 585 },
  {
    id: "manga",
    href: "/wiki/manga",
    countKey: "mangaVolumes",
    region: "archives",
    x: 1280,
    y: 205,
  },
  {
    id: "databooks",
    href: "/wiki/databooks",
    countKey: "databooks",
    region: "archives",
    x: 1815,
    y: 205,
  },
  { id: "interviews", href: "/wiki/interviews", region: "archives", x: 1210, y: 415 },
  { id: "toriyama", href: "/wiki/toriyama", region: "archives", x: 1850, y: 425 },
  { id: "staff", href: "/wiki/staff", region: "archives", x: 1260, y: 545 },
  { id: "timeline", href: "/wiki/timeline", region: "archives", x: 1600, y: 570 },
  { id: "canon", href: "/wiki/canon", region: "archives", x: 1880, y: 560 },
];

export const WIKI_SCENE_REGIONS: readonly WikiSceneRegion[] = [
  "earth",
  "namek",
  "capsule",
  "archives",
];
export const WORLD_SIZE = { width: 2100, height: 1320 } as const;
export const SCENE_DEPTH_RECT = { x: 1165, y: 1020, width: 300, height: 210 } as const;
export const REGION_CENTERS: Record<WikiSceneRegion, { x: number; y: number }> = {
  earth: { x: 500, y: 885 },
  namek: { x: 1515, y: 890 },
  capsule: { x: 530, y: 365 },
  archives: { x: 1550, y: 370 },
};
export const REGION_LABEL_POINTS: Record<WikiSceneRegion, { x: number; y: number }> = {
  earth: { x: 500, y: 580 },
  namek: { x: 1530, y: 650 },
  capsule: { x: 535, y: 150 },
  archives: { x: 1540, y: 75 },
};

export type WikiSceneCamera = { scale: number; x: number; y: number };

/** One camera projection owns both GPU geometry and the accessible DOM hotspots. */
export function sceneCamera(view: WikiSceneView, width: number, height: number): WikiSceneCamera {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  if (view === "atlas") {
    const scale = Math.min(safeWidth / WORLD_SIZE.width, safeHeight / WORLD_SIZE.height);
    return {
      scale,
      x: (safeWidth - WORLD_SIZE.width * scale) / 2,
      y: (safeHeight - WORLD_SIZE.height * scale) / 2,
    };
  }
  const scale = Math.min(safeWidth / 800, safeHeight / 670);
  const center = REGION_CENTERS[view];
  return { scale, x: safeWidth / 2 - center.x * scale, y: safeHeight / 2 - center.y * scale };
}

export function scenePoint(camera: WikiSceneCamera, x: number, y: number) {
  return { x: camera.x + x * camera.scale, y: camera.y + y * camera.scale };
}

/** Mobile callouts flank the landmark in readable lanes instead of shrinking their touch targets. */
export function sceneHotspotPoint(
  entry: WikiSceneCategory,
  view: WikiSceneView,
  width: number,
  height: number,
) {
  if (width < 760 && view !== "atlas") {
    const entries = WIKI_SCENE_CATEGORIES.filter((category) => category.region === view);
    const index = entries.findIndex((category) => category.id === entry.id);
    const rows = Math.ceil(entries.length / 2);
    const row = Math.floor(index / 2);
    return {
      x: width * (index % 2 ? 0.76 : 0.24),
      y: height * (0.18 + (row / Math.max(1, rows - 1)) * 0.66),
    };
  }
  return scenePoint(sceneCamera(view, width, height), entry.x, entry.y);
}
