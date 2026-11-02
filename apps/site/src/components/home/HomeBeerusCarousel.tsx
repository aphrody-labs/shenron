"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
import { useLocale } from "next-intl";
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useT } from "@/components/T";
import { DBS_BEERUS_SERIES_CODE } from "@/lib/episode-series-catalogue";
import {
  SLIDE_DURATION_MS,
  canAutoSwitch,
  durationMinutes,
  formatAirDate,
  wrapIndex,
  type BeerusSlide,
} from "./beerus-slides";
import { HomeBeerusLogo } from "./HomeBeerusLogo";
import { useHomeMotion } from "./HomeMotion";
import { HomeSoundCue } from "./HomeSoundCue";
import styles from "./HomeHero.module.css";

const SWIPE_MIN_PX = 48;
/** Outlasts the incoming fade (CSS --hero-enter) so the outgoing image keeps zooming while it fades. */
const LEAVE_MS = 900;

/**
 * Full-frame carousel of the latest aired DB Beerus episodes. Every slide is a real
 * episode; the progress bar is the CSS animation that actually times the slide.
 */
export function HomeBeerusCarousel({ slides }: { slides: readonly BeerusSlide[] }) {
  const count = slides.length;
  const root = useRef<HTMLElement>(null);
  const t = useT();
  const locale = useLocale();
  const motion = useHomeMotion();
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const [inView, setInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [now, setNow] = useState<number | undefined>(undefined);
  const [announcement, setAnnouncement] = useState("");
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      setReduced(query.matches);
      setPageVisible(!document.hidden);
    };
    sync();
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    query.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    const observer = new IntersectionObserver(([entry]) => setInView(!!entry?.isIntersecting));
    if (root.current) observer.observe(root.current);
    return () => {
      clearInterval(tick);
      clearTimeout(leaveTimer.current);
      query.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
      observer.disconnect();
    };
  }, []);

  const auto = canAutoSwitch(count) && motion && !reduced;
  const running = auto && inView && pageVisible && !paused && !hovered && !keyboardFocus;

  /** The final state is set here, never read back from an animation or transition event. */
  const goTo = useCallback(
    (target: number, manual: boolean) => {
      const next = wrapIndex(target, count);
      if (next !== index) {
        setLeaving(index);
        setIndex(next);
        clearTimeout(leaveTimer.current);
        leaveTimer.current = setTimeout(() => setLeaving(null), LEAVE_MS);
      }
      const slide = slides[next];
      setAnnouncement(
        manual && slide
          ? `${t("accueil.hero.carousel.slideOf", { current: next + 1, total: count })}. ${slide.title}`
          : "",
      );
    },
    [count, index, slides, t],
  );

  const step = (delta: number) => goTo(index + delta, true);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      step(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      step(1);
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    swiped.current = false;
    if (event.pointerType === "mouse") return;
    swipe.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
      swiped.current = true;
      step(dx < 0 ? 1 : -1);
    }
  };

  const labels = useMemo(
    () =>
      slides.map((slide) =>
        t("accueil.hero.carousel.goTo", { number: slide.number ?? "", title: slide.title }),
      ),
    [slides, t],
  );

  if (count === 0) return null;

  return (
    <section
      ref={root}
      className={styles.carousel}
      aria-roledescription={t("accueil.hero.carousel.roleDescription")}
      aria-label={t("accueil.hero.carousel.label")}
      data-running={running}
      data-auto={auto}
      style={{ "--slide-ms": `${SLIDE_DURATION_MS}ms` } as CSSProperties}
      onKeyDown={onKeyDown}
      onPointerEnter={(event) => event.pointerType === "mouse" && setHovered(true)}
      onPointerLeave={(event) => event.pointerType === "mouse" && setHovered(false)}
      onFocus={(event) => {
        if (event.target.matches(":focus-visible")) setKeyboardFocus(true);
      }}
      onBlur={(event) => {
        if (!root.current?.contains(event.relatedTarget as Node | null)) setKeyboardFocus(false);
      }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (swipe.current = null)}
      onClickCapture={(event) => {
        if (swiped.current) {
          event.preventDefault();
          event.stopPropagation();
          swiped.current = false;
        }
      }}
    >
      <div className={styles.mediaStack} aria-hidden="true">
        {slides.map((slide, position) => {
          const near = position === index || position === wrapIndex(index + 1, count);
          return (
            <div
              key={slide.id}
              className={styles.media}
              data-active={position === index}
              data-leaving={position === leaving}
            >
              {slide.image && (
                <img
                  src={slide.image}
                  alt=""
                  width={1440}
                  height={810}
                  loading={position === 0 || near ? "eager" : "lazy"}
                  fetchPriority={position === 0 ? "high" : "auto"}
                  decoding={position === 0 ? "sync" : "async"}
                  className={styles.mediaImage}
                />
              )}
            </div>
          );
        })}
        <div className={styles.veil} />
      </div>

      <div className={styles.carouselBody}>
        <p className={styles.eyebrow}>
          <span className={styles.eyebrowDot} aria-hidden="true" />
          {t("accueil.hero.featureEyebrow")}
        </p>
        <h2 className="sr-only">{t("dbsBeerus.title")}</h2>
        <HomeBeerusLogo />

        <div className={styles.slides} aria-live={running ? "off" : "polite"} aria-atomic="false">
          {slides.map((slide, position) => {
            const active = position === index;
            return (
              <div
                key={slide.id}
                className={styles.slide}
                role="group"
                aria-roledescription={t("accueil.hero.carousel.slideRoleDescription")}
                aria-label={t("accueil.hero.carousel.slideOf", {
                  current: position + 1,
                  total: count,
                })}
                data-active={active}
                inert={!active}
              >
                <p className={styles.meta}>
                  <span className={styles.episodeBadge}>
                    {t("accueil.hero.episodeNumber", { number: slide.number ?? "" })}
                  </span>
                  {slide.airDate && (
                    <time dateTime={new Date(slide.airDate * 1000).toISOString()}>
                      {t("accueil.hero.carousel.aired", {
                        date: formatAirDate(slide.airDate, locale, now),
                      })}
                    </time>
                  )}
                  {slide.durationSec && (
                    <span>
                      {t("accueil.hero.carousel.duration", {
                        minutes: durationMinutes(slide.durationSec),
                      })}
                    </span>
                  )}
                </p>
                <p className={styles.episodeTitle}>{slide.title}</p>
                <div className={styles.actions}>
                  <Link href={`/wiki/episodes/${slide.id}`} className={styles.primary}>
                    <Play size={19} fill="currentColor" aria-hidden="true" />
                    {t("accueil.hero.watchEpisode", { number: slide.number ?? "" })}
                  </Link>
                  <Link
                    href={`/wiki/episodes/series/${DBS_BEERUS_SERIES_CODE}`}
                    className={styles.secondary}
                  >
                    <ArrowRight size={19} aria-hidden="true" />
                    {t("dbsBeerus.heroAll")}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        {count > 1 && (
          <div className={styles.controlBar}>
            <div
              className={styles.segments}
              role="group"
              aria-label={t("accueil.hero.carousel.segments")}
            >
              {slides.map((slide, position) => {
                const state = position === index ? "active" : position < index ? "done" : "todo";
                return (
                  <button
                    key={slide.id}
                    type="button"
                    className={styles.segment}
                    aria-label={labels[position]}
                    aria-current={position === index ? "true" : undefined}
                    onClick={() => goTo(position, true)}
                  >
                    <span className={styles.track} aria-hidden="true">
                      <span
                        className={styles.fill}
                        data-state={state}
                        onAnimationEnd={(event) => {
                          if (
                            state === "active" &&
                            event.target === event.currentTarget &&
                            event.animationName.includes("heroProgress")
                          ) {
                            goTo(index + 1, false);
                          }
                        }}
                      />
                    </span>
                  </button>
                );
              })}
            </div>
            <div className={styles.controls}>
              <button
                type="button"
                className={styles.control}
                aria-label={t("accueil.hero.carousel.previous")}
                onClick={() => step(-1)}
              >
                <ChevronLeft size={20} aria-hidden="true" />
              </button>
              {auto && (
                <button
                  type="button"
                  className={styles.control}
                  aria-pressed={paused}
                  aria-label={t(
                    paused ? "accueil.hero.carousel.play" : "accueil.hero.carousel.pause",
                  )}
                  onClick={() => {
                    setPaused((value) => !value);
                    setKeyboardFocus(false);
                  }}
                >
                  {paused ? (
                    <Play size={18} aria-hidden="true" />
                  ) : (
                    <Pause size={18} aria-hidden="true" />
                  )}
                </button>
              )}
              <button
                type="button"
                className={styles.control}
                aria-label={t("accueil.hero.carousel.next")}
                onClick={() => step(1)}
              >
                <ChevronRight size={20} aria-hidden="true" />
              </button>
              <HomeSoundCue />
            </div>
          </div>
        )}
        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>
      </div>
    </section>
  );
}
