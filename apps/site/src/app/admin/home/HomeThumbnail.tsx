"use client";

import { useState } from "react";
import { Film } from "@aphrody/shenron-ui/icones";

/** Failed previews remain placeholders; the configured asset is never rewritten. */
export function HomeThumbnail({ src, className = "" }: { src?: string; className?: string }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  if (!src || failedSource === src) {
    return (
      <span
        aria-hidden="true"
        className="flex h-full w-full items-center justify-center bg-zinc-900 text-zinc-500"
      >
        <Film className="h-4 w-4" />
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className={`h-full w-full object-cover ${className}`}
      onError={() => setFailedSource(src)}
    />
  );
}
