"use client";
/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- The named overflow region must support native keyboard scrolling. */

import { Children, isValidElement, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronBas, Lecture } from "@aphrody/shenron-ui/icones";
import { useT } from "@/components/T";
import "./home-screen-deck.css";

/** Native snapping keeps touch, keyboard, links and oversized panels usable. */
export function HomeScreenDeck({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const t = useT();
  const screens = Children.toArray(children);

  useEffect(() => {
    const deck = ref.current;
    if (!deck) return;
    const measure = () => {
      const viewport = window.visualViewport?.height ?? window.innerHeight;
      const top = Math.max(0, deck.getBoundingClientRect().top);
      const mobileNav =
        document.querySelector("[data-shell-mobile-nav]")?.getBoundingClientRect().height ?? 0;
      deck.style.setProperty(
        "--home-screen-height",
        `${Math.max(240, viewport - top - mobileNav)}px`,
      );
    };
    measure();
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.screen));
        }
      },
      { root: deck, rootMargin: "-40% 0px -40% 0px", threshold: 0 },
    );
    for (const screen of deck.children) observer.observe(screen);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, []);

  const go = (index: number) => {
    const deck = ref.current;
    const screen = deck?.children[index] as HTMLElement | undefined;
    if (!deck || !screen) return;
    deck.scrollTo({ top: screen.offsetTop, behavior: "instant" });
    // Move keyboard focus with the screen so subsequent Tab stays in its content.
    screen.focus({ preventScroll: true });
  };

  return (
    <div className="home-screen-experience">
      <section
        ref={ref}
        className="home-screen-deck"
        aria-label={t("accueil.hero.title")}
        tabIndex={0}
      >
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
        <Link href="/wiki/gifs" aria-label={t("gifLibrary.title")} title={t("gifLibrary.title")}>
          <Lecture size={22} />
        </Link>
        <button
          type="button"
          disabled={active === 0}
          onClick={() => go(active - 1)}
          aria-label={t("gifLibrary.previous")}
        >
          <ChevronBas size={22} className="rotate-180" />
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
          <ChevronBas size={22} />
        </button>
      </div>
    </div>
  );
}
