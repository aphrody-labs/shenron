"use client";

import { Children, isValidElement, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { flushSync } from "react-dom";
import { MaterialSymbol } from "@aphrody/shenron-ui/icones";
import { useT } from "@/components/T";
import { HomeMotion } from "./HomeMotion";
import "./home-screen-deck.css";

/** Document scrolling preserves compact sections and accessible panel navigation. */
export function HomeScreenDeck({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const [motion, setMotion] = useState(true);
  const transitionRef = useRef<ViewTransition | null>(null);
  const t = useT();
  const screens = Children.toArray(children);

  useEffect(() => {
    const deck = ref.current;
    if (!deck) return;
    let observer: IntersectionObserver | undefined;
    const observe = () => {
      observer?.disconnect();
      const inset = Math.round(window.innerHeight * 0.4);
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting)
              setActive(Number((entry.target as HTMLElement).dataset.screen));
          }
        },
        { rootMargin: `-${inset}px 0px -${inset}px 0px`, threshold: 0 },
      );
      for (const screen of deck.children) observer.observe(screen);
    };
    observe();
    window.addEventListener("resize", observe);
    return () => {
      if (transitionRef.current) {
        transitionRef.current.skipTransition();
        transitionRef.current = null;
        delete document.documentElement.dataset.homeTransition;
      }
      observer?.disconnect();
      window.removeEventListener("resize", observe);
    };
  }, []);

  const go = (index: number) => {
    const deck = ref.current;
    const screen = deck?.children[index] as HTMLElement | undefined;
    if (!deck || !screen) return;
    const move = () => {
      screen.scrollIntoView({ block: "start", behavior: "instant" });
      setActive(index);
      screen.focus({ preventScroll: true });
    };
    if (
      !motion ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      typeof document.startViewTransition !== "function"
    ) {
      move();
      return;
    }
    transitionRef.current?.skipTransition();
    document.documentElement.dataset.homeTransition = "teleport";
    const transition = document.startViewTransition(() => {
      flushSync(move);
    });
    transitionRef.current = transition;
    void transition.ready.catch(() => {});
    void transition.updateCallbackDone.catch(() => {});
    void transition.finished
      .catch(() => {})
      .finally(() => {
        if (transitionRef.current === transition) {
          transitionRef.current = null;
          delete document.documentElement.dataset.homeTransition;
        }
      });
  };

  return (
    <HomeMotion value={motion}>
      <div className="home-screen-experience" data-home-motion={motion ? "running" : "paused"}>
        <section ref={ref} className="home-screen-deck" aria-label={t("accueil.hero.title")}>
          {screens.map((screen, index) => (
            <div
              key={isValidElement(screen) ? screen.key : String(screen)}
              data-screen={index}
              data-active={active === index}
              className="home-screen"
              tabIndex={-1}
            >
              <div className="home-screen-content">{screen}</div>
            </div>
          ))}
        </section>
        <div className="home-screen-controls">
          <button
            type="button"
            onClick={() => setMotion((value) => !value)}
            aria-label={t(motion ? "gifLibrary.pause" : "gifLibrary.animate")}
          >
            <MaterialSymbol name={motion ? "pause" : "play_arrow"} size={24} />
          </button>
          <Link href="/wiki/gifs" aria-label={t("gifLibrary.title")} title={t("gifLibrary.title")}>
            <MaterialSymbol name="gif" size={24} />
          </Link>
          <button
            type="button"
            disabled={active === 0}
            onClick={() => go(active - 1)}
            aria-label={t("gifLibrary.previous")}
          >
            <MaterialSymbol name="keyboard_arrow_up" size={24} />
          </button>
          <span aria-hidden="true" className="home-screen-count">
            {active + 1} / {screens.length}
          </span>
          <button
            type="button"
            disabled={active === screens.length - 1}
            onClick={() => go(active + 1)}
            aria-label={t("gifLibrary.next")}
          >
            <MaterialSymbol name="keyboard_arrow_down" size={24} />
          </button>
        </div>
      </div>
    </HomeMotion>
  );
}
