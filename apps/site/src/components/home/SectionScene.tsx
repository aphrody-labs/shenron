"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { HomeScene } from "@/lib/home-scenes";
import { SceneBackdrop } from "./SceneBackdrop";

/**
 * A home block over its own clip (`section.scene`, edited from `/admin/home`).
 *
 * Lazy on two levels: the backdrop is only mounted once the block comes near the viewport
 * (nothing is requested for the blocks below the fold at first render), and its video only
 * plays while the block is on screen. `SceneBackdrop` keeps phones, reduced motion and data
 * saving on the still image.
 */
export function SectionScene({
  scene,
  className = "",
  children,
}: {
  scene: HomeScene;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const approach = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setNear(true);
        approach.disconnect();
      },
      { rootMargin: "320px 0px" },
    );
    const play = new IntersectionObserver(
      ([entry]) => setActive(!!entry && entry.isIntersecting && entry.intersectionRatio >= 0.3),
      { threshold: [0, 0.3, 0.6] },
    );
    approach.observe(el);
    play.observe(el);
    return () => {
      approach.disconnect();
      play.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      style={{ "--accent": scene.accent } as CSSProperties}
      className={`relative isolate min-w-0 overflow-hidden rounded-xl border border-white/[0.08] bg-dbz-card/60 ${className}`}
    >
      {near ? <SceneBackdrop scene={scene} active={active} /> : null}
      <div className="relative z-[3] p-4 sm:p-6">{children}</div>
    </div>
  );
}
