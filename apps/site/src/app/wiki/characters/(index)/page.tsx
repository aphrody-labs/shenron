// Keep the index loader scoped to the catalogue, not streamed detail routes.
// SPDX-License-Identifier: Apache-2.0
import { ContributeRail } from "@/components/kit";
import { GatedLink } from "@/components/GatedLink";
import { SectionHeading } from "@aphrody/shenron-ui/layout/SectionHeading";
import { Shenron } from "@aphrody/shenron-ui/icones";
import { WikiPageShell } from "@/components/wiki/WikiPageShell";
import { WikiImg } from "@/components/wiki/WikiImg";
import { CharacterGrid } from "@/components/wiki/CharacterGrid";
import { countVariantCards, getShenronCharacterCards } from "@/lib/shenron";
import { dbUniverse } from "@/lib/db-universe";
import { SectionUnavailable } from "@/components/wiki/SectionUnavailable";
import { PageBanner } from "@/components/media/PageBanner";
import { pageHero } from "@/lib/banner-config";
import type { Metadata } from "next";
import { getLaunchConfig } from "@/lib/wiki-launch-config";
import { comparerRichesse, scoreRichesse, type SignauxRichesse } from "@/lib/character-richesse";

import { ogMeta } from "@/lib/og";

export const revalidate = 3600;

/**
 * Note de richesse d'une fiche, ou 0 si la mesure n'a pas répondu.
 *
 * `characterRichesse()` passe par `safe()` : elle rend `null` plutôt que de
 * faire tomber la page si la requête échoue. Dans ce cas la grille se range par
 * ordre alphabétique (le départage de `comparerRichesse`) — dégradé, mais jamais
 * cassé, et jamais l'ordre d'insertion de l'ingest.
 */
function noteDe(signaux: Map<number, SignauxRichesse> | null, id: number): number {
  const s = signaux?.get(id);
  return s ? Math.round(scoreRichesse(s) * 10) / 10 : 0;
}

export const metadata: Metadata = {
  title: "Personnages Dragon Ball",
  description:
    "Tous les personnages canon de l'univers Dragon Ball. Fiches descriptives, ki, noms japonais, races, statuts et caractéristiques.",
  ...ogMeta({
    title: "Personnages Dragon Ball — DBFR",
    description:
      "Tous les personnages canon de l'univers Dragon Ball. Fiches descriptives, ki, noms japonais, races, statuts et caractéristiques.",
    canonical: "/wiki/characters",
    type: "website",
  }),
};

export default async function PersonnagesPage() {
  // `access` : instantané de la configuration de lancement, résolu ICI (serveur)
  // et passé aux grilles client, qui ne peuvent pas le lire elles-mêmes. Sans lui,
  // chaque vignette liait une fiche fermée → 307 vers `/coming-soon`.
  let characters: Awaited<ReturnType<typeof getShenronCharacterCards>>;
  let facets: Awaited<ReturnType<typeof dbUniverse.characterFacets>>;
  let access: Awaited<ReturnType<typeof getLaunchConfig>> | null;
  let variants: Awaited<ReturnType<typeof countVariantCards>>;
  let richesse: Awaited<ReturnType<typeof dbUniverse.characterRichesse>>;
  let dragons: Awaited<ReturnType<typeof dbUniverse.dragons>>;
  try {
    [characters, facets, access, variants, richesse, dragons] = await Promise.all([
      getShenronCharacterCards(),
      dbUniverse.characterFacets(),
      getLaunchConfig().catch(() => null),
      countVariantCards(),
      dbUniverse.characterRichesse(),
      dbUniverse.dragons(),
    ]);
  } catch (error) {
    console.error("[wiki/characters] data unavailable", error);
    return <SectionUnavailable title="Personnages Dragon Ball" />;
  }

  // Classement « les mieux documentés d'abord ». Sans lui, la grille servait les
  // 1 307 fiches dans l'ordre d'insertion de l'ingest : le visiteur tombait sur
  // des figures d'un seul chapitre avant Goku. La note est mesurée
  // (cf. `@/lib/character-richesse`), pas saisie à la main.
  // Restriction stricte demandée : Son Goku (1) et Kid Buu (90) uniquement
  const allowedCharacters = characters.filter(
    (c) => c.id === 1 || c.id === 90 || c.slug === "son-goku" || c.slug === "kid-buu",
  );
  const cartes = allowedCharacters
    .map((c) => ({
      id: c.id,
      name: c.name,
      nameJa: c.nameJa,
      race: c.race,
      // `ki` retiré de la charge : déclaré dans le type de la grille mais
      // jamais rendu — 1 307 valeurs qui traversaient le réseau pour rien.
      image: c.image,
      portraitXv2: c.portraitXv2,
      // Arrondi au dixième : la note ne sert qu'à trier et à afficher une
      // jauge, deux décimales de plus ne feraient qu'alourdir la charge RSC.
      richesse: noteDe(richesse, c.id),
    }))
    .toSorted(comparerRichesse);
  const dragonsShown = dragons ?? [];
  const heroImage = await pageHero("personnages");

  return (
    <WikiPageShell
      crumbs={[{ label: "Wiki", href: "/wiki" }, { label: "Personnages" }]}
      adminBar
      category="characters"
      title="Personnages"
      lead={`${allowedCharacters.length} fiches, des héros du récit aux figures d'un seul chapitre.`}
    >
      <PageBanner src={heroImage} alt="Personnages Dragon Ball" position="top" />
      <CharacterGrid
        access={access}
        characters={cartes}
        nbVariants={variants}
        facets={facets ?? undefined}
      />
      {dragonsShown.length > 0 && (
        <section aria-labelledby="dragons-personnages" className="space-y-6">
          <SectionHeading
            id="dragons-personnages"
            title="Dragons sacrés"
            standfirst="Ces personnages et leurs règles d'invocation font partie de l'encyclopédie des personnages."
            actions={
              <GatedLink
                href="/wiki/dragons"
                className="inline-flex min-h-11 items-center rounded-xl border border-white/[0.12] px-4 text-[13px] font-semibold text-white/80 transition-colors hover:border-dbz-orange/60 hover:text-white"
              >
                Dragons et vœux
              </GatedLink>
            }
          />
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {dragonsShown.map((dragon) => (
              <li
                key={dragon.id}
                id={dragon.slug ? `dragon-${dragon.slug}` : undefined}
                className="scroll-mt-24 flex items-center gap-4 rounded-xl border border-white/[0.08] bg-dbz-card/70 p-4"
              >
                {/* `image` est un chemin d'asset brut de la base (`./assets/wiki/…`) :
                    `WikiImg` le résout vers l'hôte d'assets et retombe sur un repère
                    neutre si le fichier manque. */}
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-dbz-orange/10">
                  {dragon.image ? (
                    <WikiImg src={dragon.image} alt="" sizes="64px" className="object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-dbz-orange/80">
                      <Shenron size={32} />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="font-display font-semibold text-white">{dragon.name}</h3>
                  {dragon.name_ja && (
                    <p lang="ja" className="font-jp text-xs text-dbz-orange/90">
                      {dragon.name_ja}
                    </p>
                  )}
                  {dragon.creator && (
                    <p className="mt-1 text-xs text-white/60">Créé par {dragon.creator}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ContributeRail quoiKey="kit.contribute.what.character" />
    </WikiPageShell>
  );
}
