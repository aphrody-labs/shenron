// SPDX-License-Identifier: Apache-2.0
/** Illustration colours have named roles and can be replaced by product theme tokens. */
export const SCENE_PALETTE = {
  ink: "#142840",
  sky: "#a9def1",
  skyLight: "#ecf9ef",
  sea: "#349db6",
  seaLight: "#6dc7cb",
  seaShadow: "#257b9a",
  cloud: "#fffdf2",
  cloudShade: "#cfe6e1",
  sand: "#f2dfa2",
  sandShade: "#d1b977",
  grass: "#84b958",
  grassShade: "#4d934f",
  namekGrass: "#58bca8",
  namekShade: "#338e96",
  namekTree: "#8fe4cb",
  trunk: "#725852",
  roof: "#b64140",
  roofShade: "#79343f",
  house: "#eba1ac",
  houseShade: "#d38393",
  houseTrim: "#fff4e6",
  houseDoor: "#3d6b5b",
  wall: "#fff1ca",
  wallShade: "#e4c7b1",
  window: "#7ab8ce",
  capsule: "#f5f5e8",
  capsuleShade: "#cad5d6",
  capsuleBlue: "#407cb4",
  capsuleGold: "#e5b55c",
  archive: "#d2b9df",
  archiveShade: "#8b83b8",
  paper: "#fff1c3",
  bookRed: "#c66a72",
  bookBlue: "#6795bc",
  sun: "#fff3b8",
} as const;
export type SceneColour = keyof typeof SCENE_PALETTE;
export type ScenePalette = Record<SceneColour, string>;

export function readScenePalette(element: HTMLElement): ScenePalette {
  const styles = getComputedStyle(element);
  return Object.fromEntries(
    Object.entries(SCENE_PALETTE).map(([key, fallback]) => [
      key,
      styles.getPropertyValue(`--scene-art-${key}`).trim() || fallback,
    ]),
  ) as ScenePalette;
}
