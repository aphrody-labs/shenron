"use client";

// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState, type RefObject } from "react";
import type Hls from "hls.js";
import { isHlsSource } from "@/lib/video-controls";
import { createVideoRecovery } from "@/lib/video-recovery";

type PlaybackStatus = "loading" | "ready" | "recovering" | "failed";

/** Owns one resource lifetime; callbacks from a disposed source cannot recover its successor. */
export function useVideoSource(
  videoRef: RefObject<HTMLVideoElement | null>,
  src: string,
  onError?: () => void,
) {
  const hlsRef = useRef<Hls | null>(null);
  const onErrorRef = useRef(onError);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ source: string; status: PlaybackStatus }>({
    source: src,
    status: "loading",
  });
  const [levels, setLevels] = useState<{ index: number; height: number; bitrate: number }[]>([]);
  const [quality, setQuality] = useState(-1);
  const [audioTracks, setAudioTracks] = useState<{ index: number; name: string }[]>([]);
  const [audioTrack, setAudioTrack] = useState(-1);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    let failed = false;
    let instance: Hls | null = null;
    const recover = createVideoRecovery();
    const update = (status: PlaybackStatus) => {
      if (!cancelled && !failed) setState({ source: src, status });
    };
    const fail = () => {
      if (cancelled || failed) return;
      failed = true;
      setState({ source: src, status: "failed" });
      onErrorRef.current?.();
    };
    const loading = () => update("loading");
    const ready = () => update("ready");
    const nativeError = () => {
      if (!instance) fail();
    };
    video.addEventListener("loadstart", loading);
    video.addEventListener("waiting", loading);
    video.addEventListener("canplay", ready);
    video.addEventListener("playing", ready);
    video.addEventListener("error", nativeError);
    update("loading");
    setLevels([]);
    setQuality(-1);
    setAudioTracks([]);
    setAudioTrack(-1);
    const setup = async () => {
      if (!isHlsSource(src)) {
        video.src = src;
        return;
      }
      try {
        const { default: Hls } = await import("hls.js");
        if (cancelled) return;
        if (!Hls.isSupported()) {
          if (video.canPlayType("application/vnd.apple.mpegurl")) video.src = src;
          else fail();
          return;
        }
        instance = new Hls({
          enableWorker: true,
          workerPath: `/assets/vendor/hls/hls.worker.js?v=${encodeURIComponent(Hls.version)}`,
          capLevelToPlayerSize: true,
          backBufferLength: 30,
          maxMaxBufferLength: 60,
        });
        hlsRef.current = instance;
        const syncTracks = () => {
          if (cancelled || failed || !instance) return;
          setLevels(
            instance.levels.map((level, index) => ({
              index,
              height: level.height,
              bitrate: level.bitrate,
            })),
          );
          setQuality(instance.autoLevelEnabled ? -1 : instance.currentLevel);
          setAudioTracks(
            instance.audioTracks.map((track, index) => ({
              index,
              name: track.name || track.lang || "",
            })),
          );
          setAudioTrack(instance.audioTrack);
        };
        instance.on(Hls.Events.MANIFEST_PARSED, syncTracks);
        instance.on(Hls.Events.LEVELS_UPDATED, syncTracks);
        instance.on(Hls.Events.AUDIO_TRACKS_UPDATED, syncTracks);
        instance.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_event, data) => {
          if (!cancelled && !failed) setAudioTrack(data.id);
        });
        instance.on(Hls.Events.ERROR, (_event, data) => {
          if (cancelled || failed || !data.fatal || !instance) return;
          const action = recover(
            data.type === Hls.ErrorTypes.NETWORK_ERROR
              ? "network"
              : data.type === Hls.ErrorTypes.MEDIA_ERROR
                ? "media"
                : "other",
          );
          if (action === "network") {
            update("recovering");
            instance.startLoad();
          } else if (action === "media") {
            update("recovering");
            instance.recoverMediaError();
          } else {
            instance.destroy();
            hlsRef.current = null;
            fail();
          }
        });
        instance.loadSource(src);
        instance.attachMedia(video);
      } catch {
        fail();
      }
    };
    void setup();
    return () => {
      cancelled = true;
      video.removeEventListener("loadstart", loading);
      video.removeEventListener("waiting", loading);
      video.removeEventListener("canplay", ready);
      video.removeEventListener("playing", ready);
      video.removeEventListener("error", nativeError);
      video.pause();
      instance?.destroy();
      if (hlsRef.current === instance) hlsRef.current = null;
      video.removeAttribute("src");
      video.load();
    };
  }, [src, attempt, videoRef]);

  return {
    status: state.source === src ? state.status : "loading",
    levels,
    quality,
    selectQuality: (value: number) => {
      const instance = hlsRef.current;
      if (!instance || !Number.isInteger(value) || value < -1 || value >= instance.levels.length)
        return;
      instance.currentLevel = value;
      setQuality(value);
    },
    audioTracks,
    audioTrack,
    selectAudioTrack: (value: number) => {
      const instance = hlsRef.current;
      if (
        !instance ||
        !Number.isInteger(value) ||
        value < 0 ||
        value >= instance.audioTracks.length
      )
        return;
      instance.audioTrack = value;
    },
    retry: () => setAttempt((value) => value + 1),
  };
}
