"use client";

import { useEffect, useRef } from "react";

export interface SubtitleTrack {
  lang: string;
  label: string;
  src: string;
}

export interface VideoPlayerProps {
  src: string;
  title: string;
  poster?: string;
  subtitles?: SubtitleTrack[];
  /**
   * Appelé quand le média ne peut pas être lu. Un flux résolu à la volée par le
   * proxy HLS peut être mort ; sans ce signal, l'appelant laisse un lecteur noir
   * là où il pourrait proposer une autre source.
   */
  onError?: () => void;
}

/**
 * URL de piste consommable par `<track>` (toujours du WebVTT) : une URL http
 * absolue est utilisée telle quelle (déjà en .vtt) ; un chemin d'asset relatif
 * passe par /api/subtitles (conversion SRT→VTT à la volée, same-origin → pas
 * de CORS sur la piste).
 */
function trackUrl(src: string): string {
  return src.startsWith("http")
    ? src
    : `/api/subtitles?src=${encodeURIComponent(src.replace(/^\.?\/*/, ""))}`;
}

/**
 * Lecteur vidéo des épisodes : `<video>` HTML5 natif (contrôles + clavier +
 * a11y de série) avec support HLS.
 *
 * - Source `.m3u8` : lecture HLS native si le navigateur la supporte (Safari/
 *   iOS), sinon attache hls.js (chargé dynamiquement, donc jamais côté serveur
 *   → SSR-safe et compatible build Turbopack). Source mp4 : lecture directe.
 * - hls.js (plain ESM) remplace Vidstack v1, que Turbopack canary n'arrive pas
 *   à parser au build prod. À réévaluer quand Vidstack sera turbopack-compatible.
 */
export function VideoPlayer({ src, title, poster, subtitles, onError }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const isHls = src.toLowerCase().includes(".m3u8");
    // mp4 (ou autre) : lecture directe, rien à charger.
    if (!isHls) {
      video.src = src;
      return;
    }
    // HLS natif (Safari/iOS) : pas besoin de hls.js.
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      return;
    }

    let hls: { destroy: () => void } | null = null;
    let cancelled = false;
    void import("hls.js").then(({ default: Hls }) => {
      if (cancelled || !videoRef.current) return;
      if (Hls.isSupported()) {
        const instance = new Hls({ enableWorker: true });
        // Recovery sur erreur fatale (pattern recommandé hls.js) : on tente
        // de relancer le réseau / réinitialiser le média avant d'abandonner,
        // pour absorber les blips réseau d'un flux HLS.
        instance.on(Hls.Events.ERROR, (_evt, data) => {
          if (!data.fatal) return;
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              instance.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              instance.recoverMediaError();
              break;
            default:
              instance.destroy();
              if (videoRef.current) {
                videoRef.current.src = src;
              }
          }
        });
        instance.loadSource(src);
        instance.attachMedia(videoRef.current);
        hls = instance;
      } else {
        videoRef.current.src = src;
      }
      return undefined;
    });

    return () => {
      cancelled = true;
      hls?.destroy();
    };
  }, [src]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      const video = videoRef.current;
      if (!video) return;

      switch (e.key.toLowerCase()) {
        case " ":
        case "k":
          e.preventDefault();
          if (video.paused) {
            void video.play();
          } else {
            video.pause();
          }
          break;
        case "j":
        case "arrowleft":
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - (e.key === "j" ? 10 : 5));
          break;
        case "l":
        case "arrowright":
          e.preventDefault();
          video.currentTime = Math.min(
            video.duration || Infinity,
            video.currentTime + (e.key === "l" ? 10 : 5),
          );
          break;
        case "f":
          e.preventDefault();
          if (!document.fullscreenElement) {
            void video.requestFullscreen();
          } else {
            void document.exitFullscreen();
          }
          break;
        case "m":
          e.preventDefault();
          video.muted = !video.muted;
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="dbz-panel group relative overflow-hidden rounded-xl border border-amber-500/30 bg-black p-0 shadow-lg shadow-black/80 transition-all duration-500 hover:border-amber-400/60 hover:shadow-[0_0_35px_rgba(245,158,11,0.25)]">
      <video
        ref={videoRef}
        controls
        playsInline
        preload="metadata"
        crossOrigin="anonymous"
        poster={poster}
        title={title}
        className="aspect-video w-full rounded-xl bg-black"
        onError={onError}
      >
        {subtitles?.map((t, i) => (
          <track
            key={`${t.lang}-${t.src}`}
            kind="subtitles"
            src={trackUrl(t.src)}
            srcLang={t.lang}
            label={t.label}
            default={i === 0}
          />
        ))}
      </video>
    </div>
  );
}
