import { dbUniverse } from "@/lib/db-universe";
import { ItemsGrid } from "@/components/wiki/ItemsGrid";
import { WikiIndexPage } from "@/components/wiki/WikiIndexPage";
import { ogMeta } from "@/lib/og";
import type { Metadata } from "next";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Objets, Artefacts & Technologies Dragon Ball",
  description:
    "Le répertoire exhaustif des objets, capsules, véhicules, armes et reliques magiques de Dragon Ball. Dragon Radar, Senzu, Potalas, Kinto-Un et Capsule Corporation.",
  ...ogMeta({
    title: "Objets & Technologies Dragon Ball — DBFR",
    description:
      "Capsules Hoi-Poi, Haricots Senzu, Bâton Magique, Vaisseaux spatiaux et inventions de Bulma répertoriés d'après le manga.",
    canonical: "/wiki/items",
    type: "website",
  }),
};

export default async function ObjetsPage() {
  const items = (await dbUniverse.items()) ?? [];
  const artwork = items.find((item) => item.image);

  return (
    <WikiIndexPage
      eyebrow="Encyclopédie & Archives"
      title="Objets & Technologies"
      lead={`${items.length} créations, reliques magiques et technologies répertoriées — des capsules révolutionnaires de Capsule Corp aux artefacts divins des Kaïōshins.`}
      image={artwork?.image ?? undefined}
      imageAlt={artwork?.name}
      crumbs={[{ label: "Objets & Technologies" }]}
      category="items"
      note={
        <>
          <strong>Note d'archive Capsule Corp :</strong> Chaque invention, vaisseau spatial ou
          relique mystique est catalogué avec son créateur officiel (Dr Brief, Bulma, Maître Karin,
          Kami-sama, Kaïōshins), son fonctionnement et son premier chapitre d'apparition dans le
          manga original.
        </>
      }
      contributeKey="kit.contribute.what.object"
    >
      <ItemsGrid items={items} />
    </WikiIndexPage>
  );
}
