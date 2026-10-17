"use client";

/**
 * Carousel — native scroll-snap strip with named arrows and a polite position
 * announcement.
 *
 * The slides stay in a real horizontal scroller: swipe, trackpad and keyboard
 * scrolling keep working without JavaScript, and the server HTML already holds
 * every slide. The arrows only call `scrollBy`. There is no autoplay: a moving
 * strip steals focus from readers and fails WCAG 2.2.2. Under
 * `prefers-reduced-motion` the arrows jump instead of gliding.
 */
import { Children, useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { workText, type WorkMessages } from "./work-messages";

export interface CarouselProps {
  /** Accessible name of the region ("Characters", "Key visuals"…). */
  label: string;
  messages: WorkMessages;
  children: ReactNode;
  /** Slides visible at once from the `md` breakpoint; one on narrow screens. */
  perView?: 1 | 2 | 3 | 4;
  className?: string;
}

const PER_VIEW = {
  1: "md:basis-full",
  2: "md:basis-1/2",
  3: "md:basis-1/3",
  4: "md:basis-1/4",
} as const;

export function Carousel({
  label,
  messages,
  children,
  perView = 1,
  className = "",
}: CarouselProps) {
  const slides = Children.toArray(children);
  const total = slides.length;
  const track = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const id = useId();

  const sync = useCallback(() => {
    const el = track.current;
    if (!el || total === 0) return;
    const width = el.scrollWidth / total;
    setCurrent(Math.min(total - 1, Math.max(0, Math.round(el.scrollLeft / width))));
  }, [total]);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    el.addEventListener("scroll", sync, { passive: true });
    return () => el.removeEventListener("scroll", sync);
  }, [sync]);

  const move = (direction: -1 | 1) => {
    const el = track.current;
    if (!el) return;
    const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: direction * el.clientWidth, behavior: reduced ? "auto" : "smooth" });
  };

  const atStart = current === 0;
  const atEnd = current >= total - perView;
  const arrow =
    "cible-44 inline-flex size-10 items-center justify-center rounded-full border border-dbz-border bg-dbz-card text-os transition-colors hover:border-dbz-orange focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-yellow disabled:pointer-events-none disabled:opacity-40";

  return (
    <section
      aria-roledescription={messages.carouselRoleDescription}
      aria-label={label}
      className={`min-w-0 ${className}`}
    >
      <div
        ref={track}
        id={id}
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scroll container must be keyboard-scrollable (WCAG 2.1.1)
        tabIndex={0}
        className="flex min-w-0 snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-smooth [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-dbz-yellow motion-reduce:scroll-auto [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((slide, index) => (
          <div
            // oxlint-disable-next-line react/no-array-index-key -- slides are positional
            key={index}
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- APG carousel slide; fieldset would imply a form
            role="group"
            aria-roledescription={messages.slideRoleDescription}
            aria-label={workText(messages, "carouselPosition", { current: index + 1, total })}
            className={`min-w-0 shrink-0 basis-full snap-start px-2 ${PER_VIEW[perView]}`}
          >
            {slide}
          </div>
        ))}
      </div>
      {total > 1 && (
        <div className="mt-4 flex items-center justify-center gap-4">
          <button
            type="button"
            aria-controls={id}
            onClick={() => move(-1)}
            disabled={atStart}
            className={arrow}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 6l-6 6 6 6" />
            </svg>
            <span className="sr-only">{messages.carouselPrevious}</span>
          </button>
          <output
            aria-live="polite"
            aria-atomic="true"
            className="min-w-[6ch] text-center font-mono text-sm text-os/70 tabular-nums"
          >
            {workText(messages, "carouselPosition", { current: current + 1, total })}
          </output>
          <button
            type="button"
            aria-controls={id}
            onClick={() => move(1)}
            disabled={atEnd}
            className={arrow}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
            <span className="sr-only">{messages.carouselNext}</span>
          </button>
        </div>
      )}
    </section>
  );
}
