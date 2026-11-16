// SPDX-License-Identifier: Apache-2.0
/**
 * packages/media/src/remotion-engine.ts
 *
 * Bridge to vendorized @shenron/remotion engine.
 * Provides frame calculations, audio waveform peak synthesis, and
 * subtitle synchronization for in-browser video players.
 */

export * from "@shenron/remotion/timeline";
export * from "@shenron/remotion/waveform";
export * from "@shenron/remotion/subtitles";

export interface RemotionCompositionProps {
  id: string;
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  videoSrc: string;
  subtitles?: Array<{ startFrame: number; endFrame: number; text: string }>;
}
