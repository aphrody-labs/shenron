// SPDX-License-Identifier: Apache-2.0
/**
 * ArcSys Anime Material Specification for Dragon Ball 3D Models in Shenron Engine.
 * Supports FighterZ, Sparking! ZERO, and Xenoverse 2.
 */

export interface ArcSysMaterialSpec {
  id: string;
  name: string;
  renderPasses: {
    outline: {
      enabled: boolean;
      cullMode: "front"; // Backface extrusion
      depthWriteEnabled: true;
      depthCompare: "less-equal";
      width: number; // ~0.0055
      depthPush: number; // ~0.0012
      color: [number, number, number, number]; // RGBA
    };
    toon: {
      cullMode: "back";
      depthWriteEnabled: true;
      depthCompare: "less-equal";
      shadowThreshold: number; // 0.48
      shadowBiasWeight: number; // 0.75
      ilmBiasWeight: number; // 0.65
      specularThreshold: number; // 0.72
      specularPower: number; // 64.0
      rimThreshold: number; // 0.58
      rimPower: number; // 3.2
      rimColor: [number, number, number, number];
    };
  };
  textures: {
    baseColorUrl: string; // Diffuse (sRGB)
    ilmUrl: string; // ILM illustration map (Linear RGBA)
    rampUrl?: string; // Optional 1D/2D Toon palette lut
  };
  vertexStreams: {
    position: "Float32x3";
    normal: "Float32x3";
    uv: "Float32x2";
    color: "Float32x4"; // Channel-packed ArcSys vertex colors (R: bias, G: outline, B: spec, A: z-push)
  };
}

export interface CharacterModelManifest {
  characterId: string;
  variant: "base" | "ssj" | "ssj_blue" | "ultra_instinct";
  sourceGame: "fighterz" | "sparking_zero" | "xenoverse2";
  modelPath: string; // Path to .glb / .shenron-model
  materials: Record<string, ArcSysMaterialSpec>;
}
