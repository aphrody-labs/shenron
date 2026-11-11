// SPDX-License-Identifier: Apache-2.0
/**
 * Dragon Ball Z: Budokai Tenkaichi 3 WebAssembly runtime configuration & runner
 * Re-exported through @aphrody/shenron-engine for the web platform.
 */

export type TenkaichiPlatform = "wii" | "ps2";

export interface TenkaichiTargetConfig {
  platform: TenkaichiPlatform;
  platformName: string;
  coreName: string;
  wasmModule: string;
  defaultAspect: "16:9" | "4:3";
  nativeWidth: number;
  nativeHeight: number;
  audioSampleRate: number;
  serialCatalog: {
    europe: string;
    usa: string;
    japan: string;
  };
}

export const TENKAICHI_TARGETS: Record<TenkaichiPlatform, TenkaichiTargetConfig> = {
  wii: {
    platform: "wii",
    platformName: "Nintendo Wii",
    coreName: "dolphin-wii-wasm",
    wasmModule: "gecko-wii.wasm",
    defaultAspect: "16:9",
    nativeWidth: 854,
    nativeHeight: 480,
    audioSampleRate: 48000,
    serialCatalog: {
      europe: "RDSP64",
      usa: "RDSE64",
      japan: "RDSJ64",
    },
  },
  ps2: {
    platform: "ps2",
    platformName: "Sony PlayStation 2",
    coreName: "pcsx2-ps2-wasm",
    wasmModule: "play2-ps2.wasm",
    defaultAspect: "4:3",
    nativeWidth: 640,
    nativeHeight: 448,
    audioSampleRate: 48000,
    serialCatalog: {
      europe: "SLES-54945",
      usa: "SLUS-21670",
      japan: "SLPS-25815",
    },
  },
};
