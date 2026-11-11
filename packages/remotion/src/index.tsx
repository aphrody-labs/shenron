// SPDX-License-Identifier: Apache-2.0
/**
 * @aphrody/remotion
 *
 * Aphrody's vendorized Remotion composition, player, and sequencing engine.
 */

import React, { createContext, useContext, useState, useEffect, useMemo } from "react";

export * from "./timeline";
export * from "./waveform";
export * from "./subtitles";

const EMPTY_PROPS: Record<string, any> = {};
const EMPTY_STYLE: React.CSSProperties = {};

export interface VideoConfig {
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  id: string;
}

const VideoConfigContext = createContext<VideoConfig>({
  fps: 24,
  width: 1920,
  height: 1080,
  durationInFrames: 34560, // 24 minutes at 24 fps
  id: "default-composition",
});

const CurrentFrameContext = createContext<number>(0);

export function useVideoConfig(): VideoConfig {
  return useContext(VideoConfigContext);
}

export function useCurrentFrame(): number {
  return useContext(CurrentFrameContext);
}

export interface CompositionProps {
  id: string;
  fps?: number;
  width?: number;
  height?: number;
  durationInFrames: number;
  component: React.ComponentType<any>;
  defaultProps?: Record<string, any>;
}

export const Composition: React.FC<CompositionProps> = ({
  id,
  fps = 24,
  width = 1920,
  height = 1080,
  durationInFrames,
  component: Component,
  defaultProps = EMPTY_PROPS,
}) => {
  const config: VideoConfig = useMemo(
    () => ({ id, fps, width, height, durationInFrames }),
    [id, fps, width, height, durationInFrames],
  );

  return (
    <VideoConfigContext.Provider value={config}>
      <Component {...defaultProps} />
    </VideoConfigContext.Provider>
  );
};

export interface SequenceProps {
  from: number;
  durationInFrames?: number;
  children: React.ReactNode;
}

export const Sequence: React.FC<SequenceProps> = ({ from, durationInFrames, children }) => {
  const currentFrame = useCurrentFrame();
  const relativeFrame = currentFrame - from;

  if (relativeFrame < 0) return null;
  if (durationInFrames !== undefined && relativeFrame >= durationInFrames) return null;

  return (
    <CurrentFrameContext.Provider value={relativeFrame}>{children}</CurrentFrameContext.Provider>
  );
};

export interface PlayerProps {
  component: React.ComponentType<any>;
  inputProps?: Record<string, any>;
  durationInFrames: number;
  fps?: number;
  compositionWidth?: number;
  compositionHeight?: number;
  controls?: boolean;
  autoPlay?: boolean;
  loop?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const Player: React.FC<PlayerProps> = ({
  component: Component,
  inputProps = EMPTY_PROPS,
  durationInFrames,
  fps = 24,
  compositionWidth = 1920,
  compositionHeight = 1080,
  controls = true,
  autoPlay = false,
  loop = false,
  className = "",
  style = EMPTY_STYLE,
}) => {
  const [frame, setFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(autoPlay);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setFrame((prev) => {
        if (prev + 1 >= durationInFrames) {
          if (loop) return 0;
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 1000 / fps);

    return () => clearInterval(interval);
  }, [isPlaying, fps, durationInFrames, loop]);

  const config: VideoConfig = useMemo(
    () => ({
      id: "player-comp",
      fps,
      width: compositionWidth,
      height: compositionHeight,
      durationInFrames,
    }),
    [fps, compositionWidth, compositionHeight, durationInFrames],
  );

  return (
    <VideoConfigContext.Provider value={config}>
      <CurrentFrameContext.Provider value={frame}>
        <div
          className={`relative overflow-hidden ${className}`}
          style={{
            width: "100%",
            aspectRatio: `${compositionWidth}/${compositionHeight}`,
            ...style,
          }}
        >
          <Component {...inputProps} />

          {controls && (
            <div className="absolute bottom-2 left-2 right-2 bg-black/75 px-3 py-1.5 rounded-lg flex items-center justify-between text-xs text-white">
              <button
                type="button"
                onClick={() => setIsPlaying(!isPlaying)}
                className="font-bold uppercase px-2 py-0.5 bg-amber-600 rounded"
              >
                {isPlaying ? "Pause" : "Play"}
              </button>
              <span className="font-mono">
                Frame: {frame} / {durationInFrames} ({Math.round((frame / fps) * 10) / 10}s)
              </span>
            </div>
          )}
        </div>
      </CurrentFrameContext.Provider>
    </VideoConfigContext.Provider>
  );
};
