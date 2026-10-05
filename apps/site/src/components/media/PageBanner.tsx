import Image from "next/image";
import { isEditableAsset } from "@/lib/images";

/**
 * Bannière administrée d'une rubrique (`/admin/banners` → `pageHero(clé)`), posée DANS la
 * colonne du shell, sous l'en-tête de page.
 *
 * Elle remplace le bandeau pleine largeur (`PageHero`) qui refaisait sa propre largeur
 * (1 280 px, gouttière de 24 px) et portait le `<h1>` par-dessus une photo : sur un
 * téléphone, le titre en capitales dorées occupait l'écran entier avant le moindre contenu.
 * Le titre vit désormais dans `PageHeader` ; l'image n'est plus qu'une illustration, à la
 * largeur du contenu, avec un ratio qui s'aplatit à mesure que l'écran s'élargit.
 */
export function PageBanner({
  src,
  alt = "",
  position = "center",
  className = "",
}: {
  /** URL déjà résolue (`pageHero`, `bannerForSeries`). Vide : rien n'est rendu. */
  src: string | null | undefined;
  /** Vide = décorative. */
  alt?: string;
  /** Cadrage vertical d'un visuel recadré en bandeau. */
  position?: "top" | "center" | "bottom";
  className?: string;
}) {
  if (!src) return null;
  const objectPosition =
    position === "top" ? "object-top" : position === "bottom" ? "object-bottom" : "object-center";
  return (
    <figure
      className={`relative mb-8 aspect-[2/1] w-full overflow-hidden rounded-xl border border-white/10 bg-dbz-card sm:aspect-[3/1] lg:aspect-[4/1] ${className}`}
    >
      <Image
        src={src}
        alt={alt}
        fill
        priority
        // Largeur réelle : la colonne du shell (1 180 px au plus), pas la fenêtre.
        sizes="(min-width: 1240px) 1180px, 100vw"
        quality={70}
        unoptimized={isEditableAsset(src)}
        className={`object-cover ${objectPosition}`}
      />
    </figure>
  );
}
