"use client";

import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { MaterialSymbol } from "@aphrody/shenron-ui/icones";
import { useT } from "@/components/T";
import { HomeMotion } from "./HomeMotion";
import "./home-screen-deck.css";

interface ClickBurst {
  id: number;
  x: number;
  y: number;
  strong: boolean;
}

/** Document scrolling preserves compact sections, tactile click feedback, and accessible panel navigation. */
export function HomeScreenDeck({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const burstSeq = useRef(0);
  const [active, setActive] = useState(0);
  const [motion, setMotion] = useState(true);
  const [bursts, setBursts] = useState<ClickBurst[]>([]);
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
      observer?.disconnect();
      window.removeEventListener("resize", observe);
    };
  }, []);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!motion || event.button !== 0) return;
      if (
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        return;
      }
      const target = event.target as HTMLElement | null;
      const strong = Boolean(
        target?.closest("a, button, [role='tab'], input, summary, [data-clickable]"),
      );
      const id = ++burstSeq.current;
      const x = Math.round(event.clientX);
      const y = Math.round(event.clientY);
      setBursts((prev) => [...prev.slice(-5), { id, x, y, strong }]);
      window.setTimeout(() => {
        setBursts((prev) => prev.filter((item) => item.id !== id));
      }, 560);
    },
    [motion],
  );

  const go = (index: number) => {
    const deck = ref.current;
    const screen = deck?.children[index] as HTMLElement | undefined;
    if (!deck || !screen) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    screen.scrollIntoView({
      block: "start",
      behavior: reducedMotion || !motion ? "instant" : "smooth",
    });
    setActive(index);
    screen.focus({ preventScroll: true });
  };

  return (
    <HomeMotion value={motion}>
      <div
        className="home-screen-experience"
        data-home-motion={motion ? "running" : "paused"}
        onPointerDown={handlePointerDown}
      >
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
        {bursts.length > 0 && (
          <div className="home-click-fx-layer" aria-hidden="true">
            {bursts.map((burst) => (
              <span
                key={burst.id}
                data-strong={burst.strong || undefined}
                className="home-click-fx"
                style={
                  {
                    "--click-x": `${burst.x}px`,
                    "--click-y": `${burst.y}px`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        )}
        <div className="home-screen-controls">
          <button
            type="button"
            onClick={() => setMotion((value) => !value)}
            aria-label={t(motion ? "gifLibrary.pause" : "gifLibrary.animate")}
          >
            <MaterialSymbol name={motion ? "pause" : "play_arrow"} size={24} />
          </button>
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
