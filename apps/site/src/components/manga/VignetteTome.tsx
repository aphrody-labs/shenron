"use client";

import { ExternalLink } from "@aphrody/shenron-ui/navigation/external";
import Link from "next/link";
import Image from "next/image";
import { assetUrl } from "@/lib/assets";
import { CadreCase, PastilleTome } from "@aphrody/shenron-ui/toriyama/MotifsCouverture";
import { useMangaUIText } from "@/lib/manga-ui-text";
import { useState } from "react";
import { MangaPreviewBadge } from "./MangaPreviewNotice";

export interface VignetteVolume {
  id: number;
  volumeNumber: number;
  title: string | null;
  cover: string | null;
  /** Verified bibliographic source for the volume, when available. */
  sourceUrl?: string | null;
  sourceLabel?: string | null;
}

/**
 * Vignette d'un tome, dessinée comme le support : la couverture est encadrée du
 * cadre de case (encre / liseré jaune / encre, coins vifs) et le numéro est
 * porté par la pastille orange en bas à droite — les deux places exactes qu'ils
 * occupent sur un tankōbon.
 *
 * Trois grilles rendaient auparavant le même bloc avec trois variantes de
 * couleur ; elles passent maintenant par ici.
 */
export function VignetteTome({
  volume,
  href,
  idx = 0,
  couleur = false,
  status,
  priority = false,
  compact = false,
  previewPages,
}: {
  volume: VignetteVolume;
  href: string;
  idx?: number;
  /** Édition couleur : accent fuchsia et badge. */
  couleur?: boolean;
  /** État éditorial mesuré par la présence de chapitres lisibles. */
  status?: "available" | "to-complete" | "preview";
  previewPages?: number;
  priority?: boolean;
  compact?: boolean;
}) {
  const t = useMangaUIText();
  const [brokenCover, setBrokenCover] = useState<string | null>(null);
  const titre = volume.title ?? t("volume", { number: volume.volumeNumber });
  return (
    <div
      data-volume-id={volume.id}
      className="group min-w-0"
      style={{ animationDelay: `${idx * 0.02}s` }}
    >
      <Link
        href={href}
        className={`block transition-transform duration-300 ${couleur ? "hover:brightness-110" : ""}`}
      >
        <CadreCase largeur={compact ? 140 : 220} className="overflow-visible">
          <div className="relative aspect-[2/3] overflow-hidden bg-dbz-bg">
            {!compact && (
              <div className="halftone pointer-events-none absolute inset-0 z-10 opacity-10" />
            )}
            {volume.cover && volume.cover !== brokenCover ? (
              <Image
                src={assetUrl(volume.cover)}
                alt={titre}
                fill
                sizes={compact ? "(max-width: 640px) 33vw, 16vw" : "(max-width: 768px) 50vw, 16vw"}
                className="object-contain transition-opacity duration-300"
                priority={priority}
                onError={() => setBrokenCover(volume.cover)}
              />
            ) : (
              <div className="grid h-full w-full place-items-center bg-card">
                <span className="font-display select-none text-3xl text-[var(--muted-foreground)]">
                  {volume.volumeNumber}
                </span>
              </div>
            )}
            {!compact && (
              <div className="absolute inset-0 z-20 bg-gradient-to-t from-black via-black/35 to-transparent" />
            )}
            {couleur && !compact && (
              <span className="absolute top-2 left-2 z-30 rounded bg-fuchsia-400 px-2 py-0.5 text-[11px] font-black text-black">
                {t("color")}
              </span>
            )}
            {status === "to-complete" && !compact && (
              <span className="absolute top-2 right-2 z-30 rounded bg-black/80 px-2 py-0.5 text-[11px] font-bold text-white/80">
                {t("toComplete")}
              </span>
            )}
            {!compact && (
              <div
                className={`absolute inset-x-0 bottom-0 z-30 flex items-end justify-between gap-2 ${compact ? "p-2" : "p-3"}`}
              >
                <p
                  className={`font-display line-clamp-2 text-sm font-bold text-white transition-colors ${
                    couleur ? "group-hover:text-fuchsia-300" : "group-hover:text-dbz-orange"
                  }`}
                >
                  {titre}
                </p>
                {!compact && <PastilleTome numero={volume.volumeNumber} taille={38} surImage />}
              </div>
            )}
          </div>
        </CadreCase>
      </Link>
      {status === "preview" && <MangaPreviewBadge count={previewPages ?? 0} />}
      {compact && (
        <div className="mt-2">
          <p className="line-clamp-2 text-xs font-semibold text-foreground">
            {t("volume", { number: volume.volumeNumber })}
            {volume.title ? ` · ${volume.title}` : ""}
          </p>
          {couleur || status === "to-complete" ? (
            <p className="text-xs text-[var(--muted-foreground)]">
              {couleur ? t("color") : t("toComplete")}
            </p>
          ) : null}
        </div>
      )}
      {volume.sourceUrl && (
        <ExternalLink
          href={volume.sourceUrl}
          className="mt-1 flex min-h-11 items-center justify-center text-center text-xs font-semibold text-primary hover:underline"
        >
          {volume.sourceLabel ?? t("source")} ↗
        </ExternalLink>
      )}
    </div>
  );
}
