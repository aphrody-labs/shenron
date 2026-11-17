// SPDX-License-Identifier: Apache-2.0
/**
 * packages/media/src/remotion-engine.ts
 *
 * Bridge to vendorized @aphrody/shenron-remotion engine.
 * Provides frame calculations, audio waveform peak synthesis, and
 * subtitle synchronization for in-browser video players.
 */

export * from "@aphrody/shenron-remotion/timeline";
export * from "@aphrody/shenron-remotion/waveform";
export * from "@aphrody/shenron-remotion/subtitles";

export interface RemotionCompositionProps {
  id: string;
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  videoSrc: string;
  subtitles?: Array<{ startFrame: number; endFrame: number; text: string }>;
}
