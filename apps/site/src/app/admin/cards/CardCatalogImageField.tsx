"use client";

import { useEffect, useState } from "react";
import { ImageField } from "@/components/admin/ImageField";
import { ASSET_BASE } from "@/lib/config";

function cardImageUrl(value: string | null | undefined) {
  const path = value?.trim();
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  const assetPath = path.replace(/^\.\//, "").replace(/^\/+/, "");
  return `${ASSET_BASE.replace(/\/+$/, "")}/${assetPath}`;
}

/** Uploads card artwork and keeps the path in the enclosing server-action form. */
export function CardCatalogImageField({
  name,
  label,
  value,
  widthName,
  heightName,
  width,
  height,
}: {
  name: string;
  label: string;
  value?: string | null;
  widthName?: string;
  heightName?: string;
  width?: number | null;
  height?: number | null;
}) {
  const [image, setImage] = useState(() => cardImageUrl(value));
  const [dimensions, setDimensions] = useState({
    width: value ? (width ?? null) : null,
    height: value ? (height ?? null) : null,
  });

  useEffect(() => {
    if (!image) return;
    let active = true;
    const probe = new Image();
    const handleLoad = () => {
      if (active && probe.naturalWidth > 0 && probe.naturalHeight > 0) {
        setDimensions({ width: probe.naturalWidth, height: probe.naturalHeight });
      }
    };
    probe.addEventListener("load", handleLoad);
    probe.src = image;
    return () => {
      active = false;
      probe.removeEventListener("load", handleLoad);
    };
  }, [image]);

  function changeImage(nextImage: string) {
    const normalized = cardImageUrl(nextImage);
    setImage(normalized);
    if (normalized !== image) setDimensions({ width: null, height: null });
  }

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium">{label}</span>
      <ImageField value={image} onChange={changeImage} subdir="cards" column={label} />
      <input type="hidden" name={name} value={image} />
      {widthName && heightName && (
        <>
          <input type="hidden" name={widthName} value={dimensions.width ?? ""} />
          <input type="hidden" name={heightName} value={dimensions.height ?? ""} />
        </>
      )}
    </div>
  );
}
