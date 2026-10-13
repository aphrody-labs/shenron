"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

export function CanvasPreviewImage({
  src,
  alt,
  profile = false,
  className = "max-w-full rounded",
}: {
  src: string;
  alt: string;
  profile?: boolean;
  className?: string;
}) {
  const t = useTranslations("adminCanvas");
  const common = useTranslations("common");
  const [failedBlob, setFailedBlob] = useState<Blob | null>(null);
  const preview = useQuery({
    queryKey: ["canvas", "preview-image", src, profile],
    queryFn: async ({ signal }) => {
      const response = await fetch(src, { signal, cache: "no-store" });
      if (profile && response.status === 404) return { kind: "profile-unavailable" } as const;
      if (!response.ok || !response.headers.get("content-type")?.startsWith("image/"))
        throw new Error(`Canvas preview unavailable (HTTP ${response.status})`);
      return { kind: "ready", blob: await response.blob() } as const;
    },
    retry: false,
    staleTime: 60_000,
    gcTime: 60_000,
  });
  if (preview.data?.kind === "profile-unavailable" && !preview.isError)
    return <output className="text-sm text-white/50 text-center">{t("profileUnavailable")}</output>;
  if (preview.isError || (preview.data?.kind === "ready" && preview.data.blob === failedBlob))
    return (
      <p role="alert" className="text-sm text-amber-100 text-center">
        {t("previewUnavailable")}
      </p>
    );
  if (preview.data?.kind !== "ready")
    return <output className="text-sm text-white/50">{common("loading")}</output>;
  return (
    <BlobPreviewImage
      blob={preview.data.blob}
      alt={alt}
      className={className}
      onError={() => setFailedBlob(preview.data?.kind === "ready" ? preview.data.blob : null)}
    />
  );
}

function BlobPreviewImage({
  blob,
  alt,
  className,
  onError,
}: {
  blob: Blob;
  alt: string;
  className: string;
  onError: () => void;
}) {
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(blob);
    if (image.current) image.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  return <img ref={image} alt={alt} className={className} onError={onError} />;
}
