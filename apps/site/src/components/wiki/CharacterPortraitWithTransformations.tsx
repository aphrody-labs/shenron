"use client";

import { useState } from "react";
import { WikiImg } from "@/components/wiki/WikiImg";

interface PortraitTransformation {
  id: number;
  name: string;
  image: string;
}

export function CharacterPortraitWithTransformations({
  src,
  fallback,
  alt,
  transformations,
  appearanceLabel,
  sagaLabel,
}: {
  src: string;
  fallback?: string | null;
  alt: string;
  transformations: PortraitTransformation[];
  appearanceLabel: string;
  sagaLabel: string;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = transformations.find((transformation) => transformation.id === selectedId);

  return (
    <div
      className="group relative inline-flex max-w-full"
      role="group"
      aria-label={appearanceLabel}
    >
      <WikiImg
        src={selected?.image ?? src}
        fallback={selected ? null : fallback}
        alt={selected ? `${alt} — ${selected.name}` : alt}
        loading="eager"
        className="relative z-10 max-h-[260px] max-w-full w-auto object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.8)] transition-transform duration-500 group-hover:scale-105"
        placeholderClassName="relative z-10 flex aspect-[3/4] max-h-[260px] w-full items-center justify-center overflow-hidden rounded bg-dbz-card"
      />

      {transformations.length > 0 && (
        <div className="absolute inset-y-1 right-1 z-20 flex w-[36%] max-w-20 flex-col gap-1 overflow-y-auto rounded-md bg-gradient-to-l from-black/90 via-black/75 to-black/20 p-1">
          <button
            type="button"
            aria-pressed={selected == null}
            title={sagaLabel}
            onClick={() => setSelectedId(null)}
            className={`min-h-8 w-full shrink-0 rounded border px-1 py-1 text-[9px] font-semibold leading-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-yellow ${selected == null ? "border-dbz-orange bg-black/90 text-dbz-orange" : "border-white/20 bg-black/65 text-white hover:border-white/50"}`}
          >
            {sagaLabel}
          </button>
          {transformations.map((transformation) => (
            <button
              key={transformation.id}
              type="button"
              aria-pressed={selected?.id === transformation.id}
              aria-label={`${appearanceLabel} — ${transformation.name}`}
              title={transformation.name}
              onClick={() => setSelectedId(transformation.id)}
              className={`min-h-8 w-full shrink-0 rounded border px-1 py-1 text-[9px] font-semibold leading-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-yellow ${selected?.id === transformation.id ? "border-dbz-orange bg-black/90 text-dbz-orange" : "border-white/20 bg-black/65 text-white hover:border-white/50"}`}
            >
              {transformation.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
