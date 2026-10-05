import Image from "next/image";
import Link from "next/link";
import { assetUrl } from "@/lib/assets";
import { isEditableAsset } from "@/lib/images";

export interface MediaPagerItem {
  href: string;
  title: string;
  /** « Épisode précédent », « Tome suivant »… */
  label: string;
  meta?: string | null;
  /** Chemin brut d'asset (résolu ici) ; omis = pas de vignette. */
  image?: string | null;
}

/**
 * Précédent / suivant d'une œuvre sérielle (épisode, film, tome) — une seule carte au lieu
 * des trois variantes de la fiche épisode (`NavCard`), de la fiche film (`MovieNavCard`) et
 * de la fiche tome.
 *
 * Mobile : les deux cartes s'empilent, pleine largeur, cible tactile ≥ 44 px. Desktop : deux
 * colonnes, la suivante alignée à droite. Vignette `next/image` à sa taille réelle.
 */
export function MediaPager({
  prev,
  next,
  ratio = "video",
  ariaLabel,
  className = "",
}: {
  prev?: MediaPagerItem | null;
  next?: MediaPagerItem | null;
  /** `video` pour un épisode (16:9), `poster` pour une affiche ou une couverture (2:3). */
  ratio?: "video" | "poster";
  ariaLabel: string;
  className?: string;
}) {
  if (!prev && !next) return null;
  return (
    <nav aria-label={ariaLabel} className={`grid gap-3 sm:grid-cols-2 ${className}`}>
      {prev ? <PagerCard item={prev} dir="prev" ratio={ratio} /> : null}
      {next ? <PagerCard item={next} dir="next" ratio={ratio} /> : null}
    </nav>
  );
}

function PagerCard({
  item,
  dir,
  ratio,
}: {
  item: MediaPagerItem;
  dir: "prev" | "next";
  ratio: "video" | "poster";
}) {
  const thumb = ratio === "video" ? "aspect-video w-24 sm:w-28" : "aspect-[2/3] w-12 sm:w-14";
  return (
    <Link
      href={item.href}
      rel={dir}
      className={`group flex min-h-11 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 transition-colors hover:border-dbz-orange/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dbz-orange ${
        dir === "next" ? "sm:col-start-2 sm:flex-row-reverse sm:text-right" : ""
      }`}
    >
      {item.image ? (
        <span className={`relative shrink-0 overflow-hidden rounded-md bg-dbz-bg ${thumb}`}>
          <Image
            src={assetUrl(item.image)}
            alt=""
            fill
            sizes={ratio === "video" ? "112px" : "56px"}
            quality={70}
            unoptimized={isEditableAsset(item.image)}
            className="object-cover"
          />
        </span>
      ) : null}
      <span className="min-w-0">
        <span className="block text-[12px] font-semibold text-dbz-orange">{item.label}</span>
        <span className="block truncate font-display font-semibold text-white transition-colors group-hover:text-dbz-orange">
          {item.title}
        </span>
        {item.meta ? <span className="block text-[12px] text-white/50">{item.meta}</span> : null}
      </span>
    </Link>
  );
}
