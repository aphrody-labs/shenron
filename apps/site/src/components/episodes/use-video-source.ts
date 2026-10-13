"use client";

// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState, type RefObject } from "react";
import {
  createVideoPlayback,
  type VideoPlayback,
  type VideoPlaybackState,
} from "@aphrody/bun-video/playback";

const initialState = (source: string): VideoPlaybackState => ({
  source,
  status: "loading",
  levels: [],
  quality: -1,
  audioTracks: [],
  audioTrack: -1,
  backend: null,
});

/** React binding; decoder lifetimes, tracks and recovery belong to Bun Video. */
export function useVideoSource(
  videoRef: RefObject<HTMLVideoElement | null>,
  src: string,
  onError?: () => void,
) {
  const controllerRef = useRef<VideoPlayback | null>(null);
  const onErrorRef = useRef(onError);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<VideoPlaybackState>(() => initialState(src));
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const controller = createVideoPlayback(video, {
      src,
      config: {
        enableWorker: true,
        workerPath: "/assets/bun-video/hls.worker.js",
        capLevelToPlayerSize: true,
        backBufferLength: 30,
        maxMaxBufferLength: 60,
      },
      onState: setState,
      onError: () => onErrorRef.current?.(),
    });
    controllerRef.current = controller;
    return () => {
      controller.destroy();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
    // eslint-disable-next-line react/exhaustive-effect-dependencies -- A retry deliberately creates a new resource lifetime.
  }, [src, attempt, videoRef]);
  const current = state.source === src ? state : initialState(src);
  return {
    ...current,
    selectQuality: (index: number) => controllerRef.current?.selectQuality(index),
    selectAudioTrack: (index: number) => controllerRef.current?.selectAudioTrack(index),
    retry: () => setAttempt((value) => value + 1),
  };
}
