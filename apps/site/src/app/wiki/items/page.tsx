// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { T } from "@/components/T";
import { ItemsAtlas } from "@/components/wiki/ItemsAtlas";
import { ItemsGrid } from "@/components/wiki/ItemsGrid";
import { WikiCanonicalFooter } from "@/components/wiki/WikiCanonicalFooter";
import { WikiIndexPage } from "@/components/wiki/WikiIndexPage";
import { dbUniverse } from "@/lib/db-universe";
import { ogMeta } from "@/lib/og";
import type { WikiSource } from "@/lib/shenron";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Objets, Véhicules, Artefacts & Technologies Dragon Ball",
  description:
    "Encyclopédie complète des objets, capsules Hoi-Poi, véhicules terrestres, vaisseaux spatiaux, armes et reliques sacrées de Dragon Ball d'après le Daizenshuu 7, le Chōzenshū 4 et le Daizenshuu 4.",
  ...ogMeta({
    title: "Objets, Véhicules & Technologies · Encyclopédie Dragon Ball",
    description:
      "Dragon Balls, Capsules Hoi-Poi, Dragon Radar, Machine Temporelle, Potalas, Scouters, Vaisseaux spatiaux et Senzu documentés avec citations des databooks et powerscaling.",
    canonical: "/wiki/items",
    type: "website",
  }),
};

const HUB_CANONICAL_SOURCES: readonly WikiSource[] = [
  {
    n: 1,
    kind: "databook",
    label:
      "Dragon Ball Daizenshuu 7 : Dragon Ball Daijiten, planches 169 à 216 (Item Dictionary : répertoire encyclopédique des objets, tenues, armes, remèdes et véhicules)",
    url: "/wiki/databooks/4?page=169",
  },
  {
    n: 2,
    kind: "databook",
    label:
      "Dragon Ball Chōzenshū 4 : Dragon Ball Super Encyclopedia, planches 177 à 232 (Item Dictionary étendu aux films, à Dragon Ball GT, à Battle of Gods et aux origines d'Akira Toriyama)",
    url: "/wiki/databooks/19?page=177",
  },
  {
    n: 3,
    kind: "databook",
    label:
      "Dragon Ball Daizenshuu 4 : World Guide, planches 124 à 140 (Blueprint of Functional Machines : classification des véhicules, avions, sous-marins, méchas et vaisseaux avec commentaires d'Akira Toriyama)",
    url: "/wiki/databooks/3?page=124",
  },
  {
    n: 4,
    kind: "databook",
    label:
      "Dragon Ball Daizenshuu 4 : World Guide, planches 141 à 158 (Technology & Supernatural : inventions de Bulma et du Dr Brief, cybernétique du Dr Gero, Scouters et artefacts divins)",
    url: "/wiki/databooks/3?page=141",
  },
  {
    n: 5,
    kind: "databook",
    label:
      "Dragon Ball Super Exciting Guide : Character Volume, planches 28, 33, 50 et 93 (Dragon Balls, Potalas, inventions de Bulma et entretien d'Akira Toriyama sur les Capsules Hoi-Poi)",
    url: "/wiki/databooks/6?page=50",
  },
  {
    n: 6,
    kind: "databook",
    label:
      "Dragon Ball Super Exciting Guide : Story Volume, planches 16, 54, 61 et 63 (objets d'aventure de Son Goku, vaisseau à gravité, salle de gravité et Eau Ultra Divine)",
    url: "/wiki/databooks/9?page=16",
  },
  {
    n: 7,
    kind: "databook",
    label:
      "Dragon Ball Chōzenshū 4 : Super Encyclopedia, planches 28 et 29 (structure des lignes temporelles engendrées par la Machine Temporelle)",
    url: "/wiki/databooks/19?page=28",
  },
  {
    n: 8,
    kind: "databook",
    label:
      "Dragon Ball GT : Perfect File Vol. 1, planches 11, 15, 18 et 27 (Dragon Balls Ultimes à étoiles noires, robot Giru à radar intégré, vaisseau Takogata et ondes Blutz)",
    url: "/wiki/databooks/20?page=15",
  },
];

export default async function ObjetsPage() {
  const items = (await dbUniverse.items()) ?? [];
  const preferredHero =
    items.find((it) => it.slug === "capsules-hoi-poi" && it.image) ??
    items.find((it) => it.slug === "dragon-radar" && it.image) ??
    items.find((it) => Boolean(it.image));

  return (
    <WikiIndexPage
      eyebrow={<T k="wiki.itemsHub.eyebrow" />}
      title={<T k="wiki.itemsHub.title" />}
      lead={<T k="wiki.itemsHub.lead" />}
      image={preferredHero?.image ?? undefined}
      imageAlt={preferredHero?.name}
      crumbs={[
        {
          label: "Objets, Véhicules & Technologies",
          display: <T k="wiki.itemsHub.crumb" />,
        },
      ]}
      category="items"
      contributeKey="kit.contribute.what.object"
    >
      <ItemsAtlas items={items} />

      <ItemsGrid items={items} />

      <WikiCanonicalFooter
        facts={[
          {
            key: "primary-dictionaries",
            label: <T k="wiki.itemsHub.factDictionariesLabel" />,
            value: "Daizenshuu 7 (p. 169–216) & Chōzenshū 4 (p. 177–232)",
            subvalue: "Dictionnaires intégraux des objets, tenues, armes et véhicules",
            href: "/wiki/databooks/4?page=169",
          },
          {
            key: "machines-blueprint",
            label: <T k="wiki.itemsHub.factMachinesLabel" />,
            value: "Daizenshuu 4 : Blueprint of Functional Machines (p. 124–158)",
            subvalue: "Plans techniques et notes de conception d'Akira Toriyama",
            href: "/wiki/databooks/3?page=124",
          },
          {
            key: "consolidation-model",
            label: <T k="wiki.itemsHub.factScopeLabel" />,
            value: "Capsules · Vaisseaux · Armement · Reliques · Biotechnologies",
            subvalue: "Variantes regroupées, citations VO vérifiables et échelle VSBW unifiée",
            href: "/wiki/databooks/19?page=177",
          },
        ]}
        sources={HUB_CANONICAL_SOURCES}
      />
    </WikiIndexPage>
  );
}
