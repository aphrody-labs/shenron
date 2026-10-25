// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from "react";
import { ClientGatedWrap } from "@/components/GatedClientLink";
import { ViewTransition } from "@/components/ViewTransition";
import { WikiImg } from "@/components/wiki/WikiImg";
import type { AccessSnapshot } from "@/lib/wiki-launch";

/**
 * Carte portrait d'un personnage — LA carte de personnage du wiki.
 *
 * Cinq variantes vivaient côte à côte : la vignette de `CharacterGrid`, les
 * « représentants » d'une race, les personnages d'une saga, les versions et
 * affiliés d'une fiche (`WikiRelatedCharacters`), et celle-ci sur l'accueil du
 * wiki. Mêmes données, cinq tailles de texte, trois proportions d'image, des
 * zooms au survol de 105 à 110 %. Il n'en reste qu'une.
 *
 * Le survol ne fait que souligner (filet orange) : tout ce qu'il montre est déjà
 * visible au toucher, et le focus clavier produit le même filet. Le repli
 * d'image passe par `WikiImg` ; une cible fermée (`access`) se rend inerte avec
 * sa pastille, sans lien vers une impasse.
 *
 * Sans `"use client"` : utilisable dans une page serveur comme dans une grille
 * client.
 */
export function CharacterPosterCard({
  href,
  name,
  race,
  subtitle,
  meta,
  image,
  fallback,
  width = "rail",
  sizes,
  loading = "lazy",
  access,
  morphId,
}: {
  href: string;
  name: string;
  race?: string | null;
  /** Seconde ligne, à la place de la race (saga d'une version, rôle…). */
  subtitle?: ReactNode;
  /** Troisième ligne discrète (mesure, forme). */
  meta?: ReactNode;
  image: string | null;
  fallback?: string | null;
  /** "rail" = largeur fixe (défilement horizontal) ; "full" = suit la grille. */
  width?: "rail" | "full";
  /** Largeur de rendu pour `next/image` ; par défaut celle d'une colonne de grille. */
  sizes?: string;
  loading?: "lazy" | "eager";
  /** Instantané d'ouverture des rubriques ; sans lui, le lien est toujours rendu. */
  access?: AccessSnapshot | null;
  /** Identifiant de morph View Transitions partagé avec l'image de la fiche. */
  morphId?: string | number;
}) {
  const img = (
    <WikiImg
      src={image}
      fallback={fallback}
      alt={name}
      loading={loading}
      sizes={
        sizes ??
        (width === "rail"
          ? "140px"
          : "(min-width: 1280px) 180px, (min-width: 1024px) 16vw, (min-width: 640px) 25vw, 45vw")
      }
      className="object-cover object-top transition-transform duration-500 group-hover/card:scale-[1.03] motion-reduce:transition-none"
    />
  );
  return (
    <ClientGatedWrap
      access={access}
      href={href}
      transitionTypes={["nav-forward"]}
      className={`group/card relative block shrink-0 snap-start rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-dbz-orange focus-visible:ring-offset-2 focus-visible:ring-offset-dbz-bg ${
        width === "rail" ? "w-[124px] sm:w-[140px]" : "w-full"
      }`}
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-white/[0.08] bg-dbz-card transition-colors group-hover/card:border-dbz-orange/60 group-focus-visible/card:border-dbz-orange/60">
        {morphId !== undefined ? (
          <ViewTransition name={`character-img-${morphId}`} share="morph">
            {img}
          </ViewTransition>
        ) : (
          img
        )}
      </div>
      <div className="mt-2 px-0.5">
        <p className="truncate font-display text-[13px] font-semibold text-white/90 transition-colors group-hover/card:text-dbz-orange group-focus-visible/card:text-dbz-orange">
          {name}
        </p>
        {(subtitle ?? race) && (
          <p className="line-clamp-2 text-xs leading-5 text-white/70">{subtitle ?? race}</p>
        )}
        {meta && <p className="line-clamp-2 text-xs leading-5 text-dbz-orange/90">{meta}</p>}
      </div>
    </ClientGatedWrap>
  );
}

/**
 * Grille de cartes de personnages : deux colonnes au téléphone, jusqu'à huit
 * sur grand écran. Une seule cadence pour toutes les listes de personnages.
 */
export function CharacterCardGrid({
  children,
  dense = false,
  className = "",
}: {
  children: ReactNode;
  /** Grille serrée (index de 1 300 fiches) plutôt que les listes d'une fiche. */
  dense?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`grid grid-cols-2 gap-x-3 gap-y-5 min-[420px]:grid-cols-3 sm:grid-cols-4 ${
        dense ? "md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8" : "lg:grid-cols-5 xl:grid-cols-6"
      } md:gap-x-4 ${className}`}
    >
      {children}
    </div>
  );
}
