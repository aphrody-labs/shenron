"use client";
// SPDX-License-Identifier: Apache-2.0
import { useState } from "react";
import { useT } from "@/components/T";
export function ArchivePreview({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  const t = useT();
  return failed ? (
    <output className="p-4 text-sm text-white/60">{t("catalog.archive.previewUnavailable")}</output>
  ) : (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className="absolute inset-0 size-full object-contain"
      onError={() => setFailed(true)}
      onLoad={(event) => {
        if (event.currentTarget.naturalWidth < 64 || event.currentTarget.naturalHeight < 64)
          setFailed(true);
      }}
    />
  );
}
