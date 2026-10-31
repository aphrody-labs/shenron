"use client";

import { useState } from "react";
import { ViewTransition } from "@aphrody/shenron-ui/layout/ViewTransition";
import { WikiImg } from "@/components/wiki/WikiImg";

interface PortraitAppearance {
  id: number;
  image: string;
  label: string;
}

export function CharacterPortraitWithTransformations({
  src,
  fallback,
  alt,
  appearances,
  appearanceLabel,
  officialLabel,
  viewTransitionName,
}: {
  src: string;
  fallback?: string | null;
  alt: string;
  appearances: PortraitAppearance[];
  appearanceLabel: string;
  officialLabel: string;
  viewTransitionName: string;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = appearances.find((appearance) => appearance.id === selectedId);

  return (
    <>
      <div className="wiki-infobox-header">{selected?.label ?? officialLabel}</div>
      <div className="group relative flex items-center justify-center overflow-hidden border-b-2 border-black bg-[#0a0a0c] p-4">
        <div aria-hidden className="halftone absolute inset-0 z-0 opacity-10" />
        <ViewTransition name={viewTransitionName} share="morph">
          <WikiImg
            src={selected?.image ?? src}
            fallback={selected ? null : fallback}
            alt={selected ? `${alt} — ${selected.label}` : alt}
            loading="eager"
            className="relative z-10 max-h-[260px] max-w-full w-auto object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.8)] transition-transform duration-500 group-hover:scale-105"
            placeholderClassName="relative z-10 flex aspect-[3/4] max-h-[260px] w-full items-center justify-center overflow-hidden rounded bg-dbz-card"
          />
        </ViewTransition>

        {appearances.length > 0 && (
          <div
            role="group"
            aria-label={appearanceLabel}
            className="pointer-events-none absolute inset-0 z-20"
          >
            <div className="pointer-events-auto absolute bottom-2 right-2 flex max-h-[calc(100%-1rem)] flex-col gap-1.5 overflow-y-auto">
              {appearances.map((appearance) => (
                <button
                  key={appearance.id}
                  type="button"
                  aria-label={appearance.label}
                  aria-pressed={selected?.id === appearance.id}
                  onClick={() =>
                    setSelectedId((current) => (current === appearance.id ? null : appearance.id))
                  }
                  className={`group/appearance relative size-10 shrink-0 overflow-hidden rounded-lg border-2 bg-black/75 p-0.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-yellow ${selected?.id === appearance.id ? "border-dbz-orange" : "border-white/50 hover:border-white"}`}
                >
                  <WikiImg
                    src={appearance.image}
                    alt=""
                    sizes="40px"
                    loading="lazy"
                    className="object-cover transition-transform group-hover/appearance:scale-110"
                    placeholderClassName="absolute inset-0 flex items-center justify-center rounded-md bg-dbz-card"
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
