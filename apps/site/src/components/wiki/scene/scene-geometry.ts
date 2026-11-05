// SPDX-License-Identifier: Apache-2.0
import type { SceneColour } from "./scene-palette";

type Paint = { fill: SceneColour; alpha?: number; stroke?: SceneColour; lineWidth?: number };
export type SceneShape = Paint &
  (
    | { kind: "ellipse"; x: number; y: number; rx: number; ry: number }
    | { kind: "rect"; x: number; y: number; width: number; height: number; radius?: number }
    | { kind: "polygon"; points: number[] }
  );
export type SceneLayer = { id: string; depth: number; shapes: SceneShape[] };

/** Original scenery: vector primitives shared by the WebGPU scene and its SVG fallback. */
export function wikiWorldGeometry(): SceneLayer[] {
  const layers: SceneLayer[] = [];
  const layer = (id: string, depth: number) => {
    const value: SceneLayer = { id, depth, shapes: [] };
    layers.push(value);
    return value.shapes;
  };
  const ellipse = (
    out: SceneShape[],
    x: number,
    y: number,
    rx: number,
    ry: number,
    fill: SceneColour,
    alpha = 1,
  ) => out.push({ kind: "ellipse", x, y, rx, ry, fill, alpha });
  const rect = (
    out: SceneShape[],
    x: number,
    y: number,
    width: number,
    height: number,
    fill: SceneColour,
    radius = 0,
    stroke?: SceneColour,
  ) =>
    out.push({
      kind: "rect",
      x,
      y,
      width,
      height,
      fill,
      radius,
      stroke,
      lineWidth: stroke ? 3 : undefined,
    });
  const poly = (out: SceneShape[], points: number[], fill: SceneColour, stroke?: SceneColour) =>
    out.push({ kind: "polygon", points, fill, stroke, lineWidth: stroke ? 3 : undefined });
  const sky = layer("distant-sky", 0.04);
  rect(sky, -300, -300, 2700, 2000, "sky");
  ellipse(sky, 1100, 120, 480, 240, "skyLight", 0.52);
  ellipse(sky, 1725, 70, 76, 76, "sun", 0.82);
  ellipse(sky, 1850, 115, 35, 35, "sun", 0.6);
  ellipse(sky, 1600, 105, 23, 23, "sun", 0.55);

  const clouds = layer("clouds", 0.15);
  const cloud = (x: number, y: number, scale: number) => {
    ellipse(clouds, x + 10 * scale, y + 18 * scale, 145 * scale, 33 * scale, "cloudShade", 0.5);
    ellipse(clouds, x, y, 150 * scale, 38 * scale, "cloud", 0.88);
    ellipse(clouds, x - 62 * scale, y - 22 * scale, 60 * scale, 40 * scale, "cloud", 0.88);
    ellipse(clouds, x + 34 * scale, y - 35 * scale, 74 * scale, 48 * scale, "cloud", 0.88);
  };
  cloud(160, 70, 0.8);
  cloud(770, 130, 1.15);
  cloud(1240, 30, 0.8);
  cloud(2020, 350, 0.7);

  const water = layer("ocean", 0.09);
  rect(water, -200, 580, 2500, 1000, "sea");
  for (let i = 0; i < 42; i++) {
    const y = 620 + i * 20;
    const x = ((i * 293) % 2150) - 60;
    ellipse(
      water,
      x,
      y,
      40 + (i % 5) * 13,
      2 + i / 25,
      i % 3 === 0 ? "seaShadow" : "seaLight",
      0.55,
    );
  }

  const islands = layer("islands", 0.3);
  ellipse(islands, 490, 1030, 420, 120, "seaShadow", 0.35);
  poly(
    islands,
    [120, 900, 250, 810, 470, 805, 780, 855, 895, 990, 710, 1120, 300, 1100, 125, 1010],
    "sandShade",
  );
  ellipse(islands, 480, 900, 380, 135, "sand");
  ellipse(islands, 475, 870, 285, 90, "grass");
  poly(
    islands,
    [1030, 870, 1150, 720, 1470, 700, 1880, 810, 2040, 1010, 1750, 1170, 1250, 1110],
    "namekShade",
  );
  ellipse(islands, 1510, 840, 470, 150, "namekGrass");
  ellipse(islands, 1610, 920, 390, 100, "namekGrass");
  ellipse(islands, 1520, 1000, 170, 48, "sea");
  ellipse(islands, 1520, 1004, 148, 34, "seaLight");

  const kame = layer("kame-house", 0.48);
  ellipse(kame, 492, 922, 190, 34, "sandShade", 0.52);
  // Inspected anime reference: pink gable, deep red roof, left dormer, pale shutters and green porch door.
  poly(kame, [330, 750, 470, 750, 470, 902, 330, 870], "houseShade", "ink");
  poly(kame, [470, 750, 560, 620, 650, 750, 650, 902, 470, 902], "house", "ink");
  poly(kame, [330, 750, 415, 635, 560, 620, 470, 750], "roofShade", "ink");
  poly(kame, [460, 752, 560, 610, 660, 752, 650, 758, 560, 628, 470, 758], "roof");
  for (let y = 764; y < 892; y += 12) rect(kame, 473, y, 174, 1.5, "houseShade");
  for (let y = 765; y < 865; y += 12)
    poly(kame, [333, y, 467, y + 15, 467, y + 16.5, 333, y + 1.5], "house");
  poly(kame, [395, 698, 405, 667, 431, 667, 431, 708, 395, 711], "house", "ink");
  poly(kame, [398, 667, 407, 654, 435, 661, 431, 668], "roof");
  rect(kame, 405, 675, 15, 27, "window", 1);
  rect(kame, 411, 675, 2, 27, "houseTrim");
  rect(kame, 405, 687, 15, 2, "houseTrim");
  rect(kame, 351, 789, 52, 62, "houseTrim", 12, "ink");
  rect(kame, 356, 794, 42, 52, "window", 9);
  rect(kame, 375, 794, 3, 52, "houseTrim");
  rect(kame, 356, 813, 42, 3, "houseTrim");
  rect(kame, 481, 798, 16, 49, "houseTrim", 1);
  rect(kame, 501, 803, 48, 40, "window", 1, "houseTrim");
  rect(kame, 553, 798, 16, 49, "houseTrim", 1);
  for (let y = 805; y < 844; y += 7) {
    rect(kame, 484, y, 10, 1, "wallShade");
    rect(kame, 556, y, 10, 1, "wallShade");
  }
  poly(kame, [577, 796, 655, 796, 677, 817, 590, 817], "roof", "ink");
  poly(kame, [577, 796, 577, 811, 590, 822, 590, 817], "houseShade");
  rect(kame, 592, 819, 6, 82, "houseTrim");
  rect(kame, 657, 819, 6, 82, "houseTrim");
  rect(kame, 602, 822, 44, 79, "houseTrim", 1);
  rect(kame, 607, 827, 34, 72, "houseDoor", 1);
  rect(kame, 607, 862, 34, 3, "houseTrim");
  ellipse(kame, 634, 875, 2, 2, "capsuleGold");
  rect(kame, 587, 901, 78, 7, "wallShade");
  rect(kame, 577, 908, 98, 7, "houseTrim");
  rect(kame, 559, 588, 2, 25, "houseTrim");
  poly(kame, [552, 588, 568, 588, 560, 578], "houseTrim");
  const palm = (x: number, y: number, direction: number) => {
    poly(
      kame,
      [x, y, x + 18, y, x + 30 * direction, y - 178, x + 17 * direction, y - 185],
      "trunk",
    );
    for (const [dx, dy] of [
      [-90, 15],
      [-64, -30],
      [-5, -52],
      [70, -35],
      [105, 8],
      [76, 48],
    ]) {
      poly(
        kame,
        [x + 20 * direction, y - 180, x + dx, y - 180 + dy, x + dx * 0.8, y - 170 + dy],
        "grassShade",
      );
    }
  };
  palm(294, 892, -1);
  palm(728, 926, 1);
  ellipse(kame, 290, 914, 23, 7, "grassShade");

  const namek = layer("namek-landmarks", 0.5);
  const tree = (x: number, y: number, s: number) => {
    poly(
      namek,
      [x - 7 * s, y, x + 8 * s, y, x + 2 * s, y - 175 * s, x - 4 * s, y - 175 * s],
      "trunk",
    );
    ellipse(namek, x, y - 175 * s, 67 * s, 47 * s, "namekShade");
    ellipse(namek, x - 5 * s, y - 191 * s, 66 * s, 43 * s, "namekTree");
    ellipse(namek, x - 20 * s, y - 204 * s, 29 * s, 18 * s, "skyLight", 0.3);
    ellipse(namek, x, y + 2 * s, 45 * s, 8 * s, "namekShade", 0.5);
  };
  tree(1140, 860, 0.9);
  tree(1830, 850, 1.25);
  tree(1710, 1130, 0.8);
  tree(1290, 1100, 0.65);
  ellipse(namek, 1500, 855, 112, 77, "wall", 1);
  rect(namek, 1390, 850, 220, 30, "wall");
  ellipse(namek, 1500, 881, 110, 17, "wallShade");
  ellipse(namek, 1500, 855, 23, 36, "trunk");
  ellipse(namek, 1465, 803, 16, 8, "window");
  ellipse(namek, 1530, 803, 16, 8, "window");

  const capsule = layer("capsule-city", 0.42);
  ellipse(capsule, 540, 480, 340, 75, "cloudShade", 0.7);
  ellipse(capsule, 540, 440, 330, 72, "capsuleShade");
  ellipse(capsule, 540, 412, 330, 72, "capsule");
  for (const [x, y, w, h] of [
    [350, 220, 74, 187],
    [662, 205, 74, 193],
    [761, 278, 45, 119],
    [266, 290, 42, 114],
  ]) {
    rect(capsule, x, y, w, h, "capsuleShade", 19, "ink");
    ellipse(capsule, x + w / 2, y + 10, w / 2, 25, "capsule");
    for (let r = 0; r < 4; r++) rect(capsule, x + 13, y + 42 + r * 24, w - 26, 9, "capsuleBlue", 2);
  }
  ellipse(capsule, 535, 300, 140, 110, "capsule", 1);
  rect(capsule, 395, 300, 280, 103, "capsule");
  ellipse(capsule, 535, 403, 140, 28, "capsuleShade");
  rect(capsule, 440, 312, 190, 24, "capsuleBlue", 12);
  rect(capsule, 500, 347, 70, 68, "window", 22, "ink");
  ellipse(capsule, 535, 233, 37, 29, "capsuleGold");
  ellipse(capsule, 535, 233, 24, 18, "capsule");

  const archives = layer("floating-archives", 0.46);
  poly(
    archives,
    [1230, 360, 1440, 300, 1780, 325, 1900, 420, 1660, 555, 1370, 510],
    "archiveShade",
  );
  ellipse(archives, 1550, 358, 320, 85, "archive");
  ellipse(archives, 1550, 330, 315, 76, "paper");
  for (let i = 0; i < 6; i++) {
    const x = 1340 + i * 72;
    rect(archives, x, 215, 30, 124, "wall", 6, "archiveShade");
    rect(archives, x - 7, 205, 44, 16, "paper", 3);
  }
  poly(archives, [1305, 205, 1544, 110, 1798, 205], "archiveShade", "ink");
  poly(archives, [1342, 194, 1545, 130, 1758, 194], "paper");
  rect(archives, 1314, 335, 472, 14, "wallShade", 3);
  rect(archives, 1338, 350, 424, 14, "wallShade", 3);
  rect(archives, 1370, 365, 362, 14, "wallShade", 3);
  for (const [x, y, color] of [
    [1190, 300, "bookRed"],
    [1840, 286, "bookBlue"],
    [1250, 470, "bookBlue"],
    [1770, 484, "bookRed"],
  ] as const) {
    poly(archives, [x, y, x + 51, y - 12, x + 81, y + 12, x + 28, y + 28], color, "ink");
    poly(
      archives,
      [x + 3, y + 6, x + 28, y + 26, x + 78, y + 13, x + 78, y + 20, x + 28, y + 34, x + 3, y + 13],
      "paper",
    );
  }

  const front = layer("foreground", 0.75);
  ellipse(front, 100, 1240, 270, 90, "grassShade");
  ellipse(front, 2040, 1235, 310, 100, "namekShade");
  for (let i = 0; i < 7; i++) {
    const x = 820 + Math.sin(i * 1.2) * 76;
    const y = 650 + i * 64;
    ellipse(front, x, y, 8, 5, "sun", 0.8);
  }
  return layers;
}
