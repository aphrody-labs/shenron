// SPDX-License-Identifier: Apache-2.0
import type { SceneGlbAsset, SceneGlbBudget } from "./glb";

export interface ReviewedDioramaAsset extends SceneGlbAsset {
  bounds: { min: readonly [number, number, number]; max: readonly [number, number, number] };
  triangles: number;
}

/** Unmodified Kenney Nature Kit 2.1 delivery assets, measured as glTF Y-up metres. */
export const PORTAL_DIORAMA_ASSETS = [
  {
    id: "kenney-tree",
    url: "/wiki-diorama/kenney-nature/tree_default.glb",
    sha256: "562d29638c902de3c7bee465d3a53bb77117efbc392ae04ed894faf6b5dc691d",
    bytes: 9428,
    units: "meters",
    upAxis: "Y",
    provenance: {
      referenceUrl: "https://kenney.nl/assets/nature-kit",
      creator: "Kenney Vleugels",
      license: "CC0-1.0",
    },
    bounds: { min: [-0.377500027, -0.05, -0.3269245], max: [0.377500027, 1.65788741, 0.3269245] },
    triangles: 114,
  },
  {
    id: "kenney-rock",
    url: "/wiki-diorama/kenney-nature/rock_largeA.glb",
    sha256: "6dd15390fd96501dcd1454765a17ba61dbbd8d47705dfe5149c8dd92b353ce25",
    bytes: 7552,
    units: "meters",
    upAxis: "Y",
    provenance: {
      referenceUrl: "https://kenney.nl/assets/nature-kit",
      creator: "Kenney Vleugels",
      license: "CC0-1.0",
    },
    bounds: {
      min: [-0.392453343, -0.05, -0.5077307],
      max: [0.392453343, 0.209775966, 0.5077307],
    },
    triangles: 80,
  },
  {
    id: "kenney-cliff",
    url: "/wiki-diorama/kenney-nature/cliff_block_rock.glb",
    sha256: "2f31de8502288d6adcdae4d5605cfe65d4bcd4369dd0decd116c2615b9d3d01f",
    bytes: 2776,
    units: "meters",
    upAxis: "Y",
    provenance: {
      referenceUrl: "https://kenney.nl/assets/nature-kit",
      creator: "Kenney Vleugels",
      license: "CC0-1.0",
    },
    bounds: { min: [-0.5, -0.05, -0.5], max: [0.5, 0.95, 0.5] },
    triangles: 12,
  },
] as const satisfies readonly ReviewedDioramaAsset[];

/** Per-asset ceilings for the three inspected, texture-free models, not arbitrary GLB uploads. */
export const PORTAL_DIORAMA_BUDGET: SceneGlbBudget = {
  maxBytes: 16_384,
  maxNodes: 16,
  maxTriangles: 256,
  maxTexturePixels: 1,
};
