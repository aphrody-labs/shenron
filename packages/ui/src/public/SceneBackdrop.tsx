// SPDX-License-Identifier: Apache-2.0
// Scene layers moved from Shenron's home/SceneBackdrop.tsx (7ff639b).
"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";

interface SaveDataConnection {
  readonly saveData?: boolean;
  addEventListener?(type: "change", listener: () => void): void;
  removeEventListener?(type: "change", listener: () => void): void;
}
const connection = () => (navigator as Navigator & { connection?: SaveDataConnection }).connection;
const VIDEO_ALLOWED = 1;
const DOCUMENT_VISIBLE = 2;
const MOTION_ALLOWED = 4;

function readPolicy(): number {
  const motion =
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches && !connection()?.saveData;
  const video = motion && !window.matchMedia("(max-width: 640px)").matches;
  return (
    (video ? VIDEO_ALLOWED : 0) |
    (!document.hidden ? DOCUMENT_VISIBLE : 0) |
    (motion ? MOTION_ALLOWED : 0)
  );
}

function subscribePolicy(update: () => void) {
  const queries = [
    window.matchMedia("(prefers-reduced-motion: reduce)"),
    window.matchMedia("(max-width: 640px)"),
  ];
  const network = connection();
  for (const query of queries) query.addEventListener("change", update);
  network?.addEventListener?.("change", update);
  document.addEventListener("visibilitychange", update);
  return () => {
    for (const query of queries) query.removeEventListener("change", update);
    network?.removeEventListener?.("change", update);
    document.removeEventListener("visibilitychange", update);
  };
}
const serverPolicy = () => 0;

/** React owns subscriptions; the server renders a still, with no browser globals. */
export function useScenePlaybackPolicy() {
  const policy = useSyncExternalStore(subscribePolicy, readPolicy, serverPolicy);
  return {
    allowVideo: Boolean(policy & VIDEO_ALLOWED),
    visible: Boolean(policy & DOCUMENT_VISIBLE),
    motionAllowed: Boolean(policy & MOTION_ALLOWED),
  };
}

export interface SceneMedia {
  image: string;
  video?: string;
  poster?: string;
  accent: string;
}
export interface SceneImageProps {
  src: string;
  alt: "";
  priority: boolean;
  className: string;
}
export interface SceneBackdropProps {
  /** Resolved asset URLs; the component has no router or backend dependency. */
  scene: SceneMedia;
  active: boolean;
  priority?: boolean;
  visible?: boolean;
  renderImage?: (props: SceneImageProps) => ReactNode;
}

export function SceneBackdrop({
  scene,
  active,
  priority = false,
  visible = true,
  renderImage,
}: SceneBackdropProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failedVideo, setFailedVideo] = useState<string | null>(null);
  const policy = useScenePlaybackPolicy();
  const hasVideo = Boolean(scene.video && policy.allowVideo && failedVideo !== scene.video);
  const shouldPlay = hasVideo && active && visible && policy.visible;
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    if (shouldPlay) {
      void video
        .play()
        .then(() => {
          if (cancelled || document.hidden) video.pause();
          return undefined;
        })
        .catch(() => {
          if (!cancelled && scene.video) setFailedVideo(scene.video);
        });
    } else video.pause();
    return () => {
      cancelled = true;
      video.pause();
    };
  }, [shouldPlay, scene.video]);

  const image: SceneImageProps = {
    src: scene.image,
    alt: "",
    priority,
    className: `scene-img absolute inset-0 h-full w-full object-cover object-[center_12%] ${active && policy.motionAllowed && policy.visible ? "scene-img--live" : ""}`,
  };
  return (
    <div
      aria-hidden
      data-active={active}
      className="scene-backdrop absolute inset-0 overflow-hidden"
      style={{ "--accent": scene.accent, opacity: visible ? 1 : 0 } as CSSProperties}
    >
      {hasVideo ? (
        <video
          key={scene.video}
          ref={videoRef}
          src={scene.video}
          poster={scene.poster ?? scene.image}
          loop
          muted
          playsInline
          preload={shouldPlay ? "auto" : "none"}
          onError={() => {
            if (scene.video) setFailedVideo(scene.video);
          }}
          className={`scene-img absolute inset-0 h-full w-full object-cover object-center transition-all duration-1000 ${active ? "scale-105 opacity-95" : "scale-100 opacity-20"}`}
        />
      ) : renderImage ? (
        renderImage(image)
      ) : (
        <img
          src={image.src}
          alt={image.alt}
          className={image.className}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
        />
      )}
      <div className="scene-grade absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-dbz-bg/85 via-dbz-bg/45 to-dbz-bg/10" />
      <div className="absolute inset-0 bg-gradient-to-t from-dbz-bg via-dbz-bg/25 to-transparent" />
      <div className="absolute inset-x-0 top-0 h-1/4 bg-gradient-to-b from-dbz-bg/55 to-transparent" />
      <div className="film-grain absolute inset-0 opacity-[0.09]" />
      <div className="scene-bar scene-bar--top" />
      <div className="scene-bar scene-bar--bottom" />
    </div>
  );
}
