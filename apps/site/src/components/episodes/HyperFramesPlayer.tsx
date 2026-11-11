// SPDX-License-Identifier: Apache-2.0
"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import { GDS_COLORS, GDS_ELEVATION, GdsChip } from "@aphrody/shenron-ui/gds";
import { formatTimecodeSMPTE, generateWaveformPeaks, type WaveformPoint } from "@aphrody/remotion";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  SkipBack,
  SkipForward,
  Cpu,
  Layers,
} from "lucide-react";

export interface HyperFramesPlayerProps {
  src: string;
  title: string;
  poster?: string;
  durationSeconds?: number;
  initialFps?: number;
  subtitles?: Array<{ lang: string; label: string; src: string }>;
  className?: string;
}

const EMPTY_SUBTITLES: Array<{ lang: string; label: string; src: string }> = [];

export const HyperFramesPlayer: React.FC<HyperFramesPlayerProps> = ({
  src,
  title,
  poster,
  durationSeconds = 1440,
  initialFps = 24,
  subtitles = EMPTY_SUBTITLES,
  className = "",
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSeconds);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedCodec, setSelectedCodec] = useState("AVC1 (H.264 Direct)");
  const [activeSubtitle, setActiveSubtitle] = useState<string | null>(
    subtitles.length > 0 ? subtitles[0].lang : null,
  );
  const [ambientGlow, setAmbientGlow] = useState(true);

  const currentFrame = Math.round(currentTime * initialFps);
  const totalFrames = Math.round(duration * initialFps);

  // Generate synthetic waveform points for the Remotion timeline
  const waveform = useMemo<WaveformPoint[]>(() => {
    return generateWaveformPeaks(duration, 150);
  }, [duration]);

  // Video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onLoadedMetadata = () => {
      if (video.duration && !isNaN(video.duration)) {
        setDuration(video.duration);
      }
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
    };
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
    } else {
      void video.play();
    }
  };

  const handleSeek = (newTime: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(duration, newTime));
  };

  const stepFrame = (framesDelta: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    const newTime = video.currentTime + framesDelta / initialFps;
    video.currentTime = Math.max(0, Math.min(duration, newTime));
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (newVol: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = newVol;
    setVolume(newVol);
    setIsMuted(newVol === 0);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      void containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      void document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full rounded-2xl overflow-hidden border border-slate-800 select-none ${className}`}
      style={{
        backgroundColor: GDS_COLORS.background,
        boxShadow: ambientGlow ? `0 0 50px rgba(224, 96, 0, 0.15)` : GDS_ELEVATION.level4,
      }}
    >
      {/* Top Header Bar */}
      <div
        className="flex items-center justify-between px-6 py-3 border-b border-slate-800"
        style={{ backgroundColor: GDS_COLORS.surfaceContainer }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-3 h-3 rounded-full animate-pulse"
            style={{ backgroundColor: GDS_COLORS.primary }}
          />
          <span
            className="font-bold tracking-wide text-sm"
            style={{ color: GDS_COLORS.onSurface, fontFamily: "Google Sans, sans-serif" }}
          >
            {title}
          </span>
          <span
            className="px-2 py-0.5 text-[10px] font-mono rounded"
            style={{
              backgroundColor: GDS_COLORS.secondaryContainer,
              color: GDS_COLORS.onSecondaryContainer,
            }}
          >
            HYPERFRAMES STREAM
          </span>
        </div>

        {/* Codec & Remotion Status Indicators */}
        <div className="flex items-center gap-2">
          <GdsChip
            selected={selectedCodec.includes("AVC1")}
            onSelectToggle={() => setSelectedCodec("AVC1 (H.264 Direct)")}
          >
            <Cpu className="w-3 h-3" />
            {selectedCodec}
          </GdsChip>
          <GdsChip selected={ambientGlow} onSelectToggle={() => setAmbientGlow(!ambientGlow)}>
            <Layers className="w-3 h-3" />
            Ambiance
          </GdsChip>
        </div>
      </div>

      {/* Main Video Viewport */}
      <div className="relative aspect-video w-full bg-black flex items-center justify-center group overflow-hidden">
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          playsInline
          className="w-full h-full object-contain"
          onClick={togglePlay}
        >
          <track kind="captions" srcLang="fr" label="Français" default />
        </video>

        {/* Play Overlay Big Button when paused */}
        {!isPlaying && (
          <button
            type="button"
            onClick={togglePlay}
            className="absolute inset-0 m-auto w-20 h-20 rounded-full flex items-center justify-center transition-transform hover:scale-110 active:scale-95 cursor-pointer backdrop-blur-sm"
            style={{
              backgroundColor: "rgba(224, 96, 0, 0.85)",
              color: "#ffffff",
              boxShadow: GDS_ELEVATION.level4,
            }}
          >
            <Play className="w-10 h-10 ml-1.5" />
          </button>
        )}
      </div>

      {/* Remotion Audio Waveform Timeline */}
      <div className="px-6 pt-3 pb-1 bg-slate-950/80 border-t border-slate-900 flex items-center gap-1 h-9">
        {waveform.map((pt) => {
          const isPassed = pt.timeSec <= currentTime;
          const barHeight = Math.max(3, Math.round(pt.amplitude * 24));
          return (
            <button
              type="button"
              key={pt.timeSec}
              aria-label={`Seek to ${Math.round(pt.timeSec)}s`}
              onClick={() => handleSeek(pt.timeSec)}
              className="flex-1 cursor-pointer transition-colors hover:bg-amber-400 rounded-sm border-0 p-0"
              style={{
                height: `${barHeight}px`,
                backgroundColor: isPassed ? GDS_COLORS.primary : "rgba(100, 116, 139, 0.4)",
              }}
            />
          );
        })}
      </div>

      {/* Video Controls Bar */}
      <div
        className="px-6 py-3 border-t border-slate-800 flex flex-col gap-2"
        style={{ backgroundColor: GDS_COLORS.surfaceContainerLow }}
      >
        {/* Scrub Bar */}
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={(e) => handleSeek(parseFloat(e.target.value))}
            className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-slate-700 accent-amber-500"
          />
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Play/Pause */}
            <button
              type="button"
              onClick={togglePlay}
              className="p-2 rounded-full hover:bg-white/10 text-white transition-colors"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>

            {/* Frame-by-Frame Stepping */}
            <button
              type="button"
              onClick={() => stepFrame(-1)}
              title="Previous Frame (<)"
              className="p-1.5 rounded hover:bg-white/10 text-slate-300 font-mono text-xs flex items-center gap-1"
            >
              <SkipBack className="w-3.5 h-3.5" />
              <span>-1F</span>
            </button>
            <button
              type="button"
              onClick={() => stepFrame(1)}
              title="Next Frame (>)"
              className="p-1.5 rounded hover:bg-white/10 text-slate-300 font-mono text-xs flex items-center gap-1"
            >
              <span>+1F</span>
              <SkipForward className="w-3.5 h-3.5" />
            </button>

            {/* Volume */}
            <div className="flex items-center gap-1 ml-2">
              <button
                type="button"
                onClick={toggleMute}
                className="p-1.5 rounded-full hover:bg-white/10 text-slate-300"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-red-400" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-16 h-1 rounded-lg appearance-none cursor-pointer bg-slate-700 accent-amber-500"
              />
            </div>

            {/* SMPTE Timecode Display */}
            <div className="text-xs font-mono text-slate-300 ml-4">
              <span className="text-amber-400 font-bold">
                {formatTimecodeSMPTE(currentFrame, initialFps)}
              </span>
              <span className="text-slate-500">
                {" "}
                / {formatTimecodeSMPTE(totalFrames, initialFps)}
              </span>
              <span className="text-slate-500 ml-2">({currentFrame} F)</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Speed Selector */}
            <select
              value={playbackRate}
              onChange={(e) => {
                const r = parseFloat(e.target.value);
                setPlaybackRate(r);
                if (videoRef.current) videoRef.current.playbackRate = r;
              }}
              className="bg-slate-800 text-xs font-mono text-slate-200 rounded px-2 py-1 border border-slate-700 cursor-pointer"
            >
              <option value="0.25">0.25x</option>
              <option value="0.5">0.5x</option>
              <option value="1">1.0x</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2.0x</option>
            </select>

            {/* Subtitles Toggle */}
            {subtitles.length > 0 && (
              <select
                value={activeSubtitle || ""}
                onChange={(e) => setActiveSubtitle(e.target.value || null)}
                className="bg-slate-800 text-xs text-slate-200 rounded px-2 py-1 border border-slate-700 cursor-pointer"
              >
                <option value="">Sous-titres (Off)</option>
                {subtitles.map((s) => (
                  <option key={s.lang} value={s.lang}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}

            {/* Fullscreen */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-2 rounded-full hover:bg-white/10 text-slate-300 transition-colors"
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
