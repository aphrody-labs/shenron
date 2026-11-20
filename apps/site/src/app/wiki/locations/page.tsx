import type { Metadata } from "next";
import { T } from "@/components/T";
import { CosmologyAtlas } from "@/components/wiki/CosmologyAtlas";
import { LocationsGrid } from "@/components/wiki/LocationsGrid";
import { WikiCanonicalFooter } from "@/components/wiki/WikiCanonicalFooter";
import { WikiIndexPage } from "@/components/wiki/WikiIndexPage";
import type { WikiSource } from "@/lib/shenron";
import { dbUniverse } from "@/lib/db-universe";
import { ogMeta } from "@/lib/og";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Cosmologie, Lieux & Sanctuaires de Dragon Ball",
  description:
    "Architecture cosmologique complète de Dragon Ball (Macrocosme, Univers 7, Autre Monde, Paradis, Enfer, Kaiōshinkai, Royaume des Démons, 12 Univers) et géographie canonique de la Terre et des planètes d'après le Daizenshuu 4.",
  ...ogMeta({
    title: "Cosmologie, Lieux & Sanctuaires · Encyclopédie Dragon Ball",
    description:
      "Explorez le Macrocosme d'Akira Toriyama, les plans divins, les dimensions parallèles, les planètes et les 12 régions terrestres du Daizenshuu 4 (World Guide).",
    type: "website",
    canonical: "/wiki/locations",
  }),
};

const HUB_CANONICAL_SOURCES: readonly WikiSource[] = [
  {
    n: 1,
    kind: "databook",
    label:
      "Dragon Ball Daizenshuu 4 : World Guide, planche 10 (croquis autographe d'Akira Toriyama : schéma de l'Au-delà et de la sphère cosmique)",
    url: "/wiki/databooks/3?page=10",
  },
  {
    n: 2,
    kind: "databook",
    label:
      "Dragon Ball Daizenshuu 4 : World Guide, planches 17 à 20 (Tenkai / The Cosmos et The Universe)",
    url: "/wiki/databooks/3?page=17",
  },
  {
    n: 3,
    kind: "databook",
    label:
      "Dragon Ball Daizenshuu 4 : World Guide, planches 51 à 54 (People of the Cosmos : hiérarchie des Kaiō, Dai Kaiō et Kaiōshin)",
    url: "/wiki/databooks/3?page=51",
  },
  {
    n: 4,
    kind: "databook",
    label:
      "Dragon Ball Daizenshuu 4 : World Guide, planches 71 et 72 (Places Besides the Earth : coupe du Macrocosme, Route du Serpent, Enma, Paradis, Enfer, Kaiōshinkai)",
    url: "/wiki/databooks/3?page=71",
  },
  {
    n: 5,
    kind: "databook",
    label:
      "Dragon Ball Daizenshuu 4 : World Guide, planches 74 à 89 (carte intégrale de la Terre en 12 secteurs A-1 à C-4, Sanctuaire de Dieu, Salle de l'Esprit et du Temps, Capsule Corp., Tenkaichi Budōkai)",
    url: "/wiki/databooks/3?page=74",
  },
  {
    n: 6,
    kind: "databook",
    label:
      "Dragon Ball Daizenshuu 7 : Dragon Ball Daijiten, planches 35 à 46 et 217 à 238 (World View for DB & Dictionnaire géographique des 197 lieux)",
    url: "/wiki/databooks/4?page=217",
  },
  {
    n: 7,
    kind: "databook",
    label:
      "Dragon Ball Chōzenshū 1 : Story & World Guide, planches 18 et 31 (New World Guide : Univers 7, Planète Kaishin, Shinjin et équilibre Kaiōshin / Beerus)",
    url: "/wiki/databooks/16?page=18",
  },
  {
    n: 8,
    kind: "databook",
    label:
      "Dragon Ball Chōzenshū 4 : Dragon Ball Super Encyclopedia, planches 34 à 37, 46 à 52 et 233 à 260 (structure des trois aires, Makai, cycle des âmes et dictionnaire géographique)",
    url: "/wiki/databooks/19?page=34",
  },
  {
    n: 9,
    kind: "databook",
    label:
      "Dragon Ball Super : Super Start Guide, planches 2 et 26 à 33 (les 12 Univers, Planète de Beerus et sanctuaires terrestres)",
    url: "/wiki/databooks/30?page=26",
  },
  {
    n: 10,
    kind: "databook",
    label:
      "Dragon Ball Super : Universe Survival Arc Support Book, planches 1 à 8 (présentation des Univers en lice et du Monde du Vide)",
    url: "/wiki/databooks/47?page=2",
  },
];

export default async function LocationsIndexPage() {
  const locations = (await dbUniverse.locations()) ?? [];
  const preferredHero =
    locations.find((loc) => loc.slug === "macrocosme-univers-7" && loc.image) ??
    locations.find((loc) => loc.slug === "domaine-kaioshin" && loc.image) ??
    locations.find((loc) => Boolean(loc.image));

  return (
    <WikiIndexPage
      eyebrow={<T k="wiki.locationsHub.eyebrow" />}
      title={<T k="wiki.locationsHub.title" />}
      lead={<T k="wiki.locationsHub.lead" />}
      image={preferredHero?.image ?? undefined}
      imageAlt={preferredHero?.name}
      crumbs={[
        {
          label: "Cosmologie & Lieux",
          display: <T k="wiki.locationsHub.crumb" />,
        },
      ]}
      category="locations"
      contributeKey="kit.contribute.what.place"
    >
      <CosmologyAtlas locations={locations} />

      <LocationsGrid locations={locations} />

      <WikiCanonicalFooter
        facts={[
          {
            key: "primary-guide",
            label: <T k="wiki.locationsHub.factPrimaryGuideLabel" />,
            value: "Dragon Ball Daizenshuu 4 : World Guide (1995)",
            subvalue: "167 planches intégralement consultables sur Dragon Ball FR",
            href: "/wiki/databooks/3?page=1",
          },
          {
            key: "cosmic-structure",
            label: <T k="wiki.locationsHub.factMacrocosmLabel" />,
            value: "Univers 7 · Autre Monde · Kaiōshinkai · Makai · 12 Univers",
            subvalue: "Coupe officielle (D4 p. 71–72) & New World Guide (Chōzenshū 1 p. 18)",
            href: "/wiki/databooks/3?page=71",
          },
          {
            key: "earth-grid",
            label: <T k="wiki.locationsHub.factEarthGridLabel" />,
            value: "Grille cartographique A-1 à C-4 (12 régions)",
            subvalue: "Supervisée par Akira Toriyama (Daizenshuu 4, p. 74–89)",
            href: "/wiki/databooks/3?page=74",
          },
        ]}
        sources={HUB_CANONICAL_SOURCES}
      />
    </WikiIndexPage>
  );
}
