"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/T";
import { useHomeMotion } from "./HomeMotion";
import styles from "./HomeHero.module.css";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { HomeSoundCue } from "./HomeSoundCue";

/** Only qualified HD stills are animated; no episode player is mounted here. */
export function HomeHeroFrames({ frames }: { frames: readonly string[] }) {
  const root = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const motion = useHomeMotion();
  const t = useT();
  const count = Math.min(frames.length, 4);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setAllowed(!query.matches && !document.hidden);
    update();
    query.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    const hero = root.current?.closest("header");
    const focusIn = () => setFocused(true);
    const focusOut = (event: FocusEvent) => {
      if (!hero?.contains(event.relatedTarget as Node | null)) setFocused(false);
    };
    hero?.addEventListener("focusin", focusIn);
    hero?.addEventListener("focusout", focusOut);
    const observer = new IntersectionObserver(([entry]) => setVisible(!!entry?.isIntersecting));
    if (root.current) observer.observe(root.current);
    return () => {
      query.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
      hero?.removeEventListener("focusin", focusIn);
      hero?.removeEventListener("focusout", focusOut);
      observer.disconnect();
    };
  }, []);
  const running = motion && allowed && visible && !paused && !focused;
  useEffect(() => {
    if (!running || count < 2) return;
    const timer = setInterval(() => setIndex((value) => (value + 1) % count), 6500);
    return () => clearInterval(timer);
  }, [running, count]);
  return (
    <div ref={root} className={styles.frames} data-running={running}>
      <div className={styles.frameStack} aria-hidden="true">
        {frames.slice(0, 4).map((src, position) => (
          <img
            key={src}
            src={src}
            alt=""
            width={1440}
            height={810}
            loading={position === 0 ? "eager" : "lazy"}
            fetchPriority={position === 0 ? "high" : "low"}
            className={styles.frame}
            data-active={position === index}
          />
        ))}
      </div>
      {frames.length > 1 && (
        <div className={styles.motionControl}>
          <button
            type="button"
            aria-label={t("gifLibrary.previous")}
            onClick={() => {
              setPaused(true);
              setIndex((value) => (value - 1 + count) % count);
            }}
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <button type="button" aria-pressed={paused} onClick={() => setPaused((value) => !value)}>
            {paused ? (
              <Play size={18} aria-hidden="true" />
            ) : (
              <Pause size={18} aria-hidden="true" />
            )}
            <span className="sr-only">
              {t(paused ? "accueil.hero.resumeFrames" : "accueil.hero.pauseFrames")}
            </span>
          </button>
          <button
            type="button"
            aria-label={t("gifLibrary.next")}
            onClick={() => {
              setPaused(true);
              setIndex((value) => (value + 1) % count);
            }}
          >
            <ChevronRight size={20} aria-hidden="true" />
          </button>
          <HomeSoundCue />
        </div>
      )}
    </div>
  );
}
