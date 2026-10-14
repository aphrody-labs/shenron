"use client";

import { useEffect, useRef, useState } from "react";
import type { HomeScene } from "@/lib/home-scenes";
import { SceneBackdrop } from "./SceneBackdrop";
import { useHomeMotion } from "./HomeMotion";
import { useScenePlaybackPolicy } from "@aphrody/shenron-ui/public/SceneBackdrop";

/** Pause between two hero scenes, as on the former home deck. */
const ROTATION_MS = 6200;

/**
 * The hero's scene pool (`config.hero.scenes`, edited from `/admin/home`): a slow cross-fade
 * between clips. Only the current scene and its two neighbours are mounted, only the current
 * one plays, and nothing plays once the hero leaves the viewport or the tab is hidden.
 * `SceneBackdrop` keeps phones, `prefers-reduced-motion` and data saving on still images; the
 * first scene's still is the LCP image (`priority`).
 */
export function HomeHeroScenes({ scenes }: { scenes: readonly HomeScene[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [onScreen, setOnScreen] = useState(true);
  const policy = useScenePlaybackPolicy();
  const motion = useHomeMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(!!entry?.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!motion || !onScreen || scenes.length <= 1 || !policy.motionAllowed || !policy.visible)
      return;
    const id = setInterval(() => {
      if (!document.hidden) setIndex((i) => (i + 1) % scenes.length);
    }, ROTATION_MS);
    return () => clearInterval(id);
  }, [motion, onScreen, scenes.length, policy.motionAllowed, policy.visible]);

  const current = index < scenes.length ? index : 0;
  const count = scenes.length;
  return (
    <div ref={ref} aria-hidden className="absolute inset-0">
      {scenes.map((scene, i) => {
        const near =
          i === current || i === (current + 1) % count || i === (current - 1 + count) % count;
        if (!near) return null;
        return (
          <SceneBackdrop
            key={`${scene.id}-${i}`}
            scene={scene}
            active={onScreen && i === current}
            visible={i === current}
            priority={i === 0}
          />
        );
      })}
    </div>
  );
}
