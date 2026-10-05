import Image from "next/image";
import { ClientGatedWrap } from "@/components/GatedClientLink";
import { assetUrl } from "@/lib/assets";
import type { HomeJourneyConfig } from "@/lib/home-scenes";
import type { AccessSnapshot } from "@/lib/wiki-launch";
import { HomeSection } from "./HomeSection";

/**
 * « Explorer aussi » — les destinations du menu qu'aucun bloc de l'accueil
 * n'ouvre déjà (`covered`). Les cartes s'éditent dans `/admin/home`.
 *
 * Sur téléphone, une liste de rangées image + texte (toute la rangée est la
 * cible) ; sur grand écran, une grille de cartes à image 16:9.
 */
export function HomeMenuJourney({
  access,
  config,
  covered = [],
  className = "",
}: {
  access: AccessSnapshot | null;
  config: HomeJourneyConfig;
  /** Destinations déjà présentées plus haut (sections, accès rapide). */
  covered?: readonly string[];
  className?: string;
}) {
  const skip = new Set(covered);
  const destinations = config.destinations.filter(
    (destination) => destination.enabled && !skip.has(destination.href),
  );
  if (!config.enabled || destinations.length === 0) return null;

  return (
    <HomeSection
      id="explorer"
      title={config.title}
      subtitle={config.subtitle}
      className={className}
    >
      <ul className="grid gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-4">
        {destinations.map((destination) => (
          <li key={destination.href}>
            <ClientGatedWrap
              access={access}
              href={destination.href}
              className="group flex h-full items-center gap-3 overflow-hidden rounded-xl border border-white/[0.08] bg-dbz-card/80 p-2 transition-colors hover:border-dbz-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange sm:flex-col sm:items-stretch sm:p-0"
            >
              <span className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-dbz-bg sm:aspect-video sm:size-auto sm:w-full sm:rounded-none">
                <Image
                  src={assetUrl(destination.image)}
                  alt=""
                  fill
                  sizes="(min-width: 1280px) 22vw, (min-width: 1024px) 30vw, (min-width: 640px) 45vw, 80px"
                  quality={70}
                  className="object-cover object-[center_25%]"
                />
              </span>
              <span className="flex min-w-0 flex-col gap-1 sm:p-4">
                <span className="font-display text-[0.9375rem] font-bold text-white transition-colors group-hover:text-dbz-gold">
                  {destination.label}
                </span>
                <span className="line-clamp-2 text-xs leading-relaxed text-white/60 sm:text-sm">
                  {destination.note}
                </span>
              </span>
            </ClientGatedWrap>
          </li>
        ))}
      </ul>
    </HomeSection>
  );
}
