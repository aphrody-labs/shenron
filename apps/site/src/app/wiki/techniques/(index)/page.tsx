// Keep the index loader scoped to the catalogue, not streamed detail routes.
import { ContributeRail } from "@/components/kit";
import { getShenronTechniques } from "@/lib/shenron";
import { WikiPageShell } from "@/components/wiki/WikiPageShell";
import { TechniqueCatalogueHeading } from "@/components/wiki/TechniqueCatalogueHeading";
import { resolveTechniqueArtwork } from "@/lib/technique-artwork";
import { TechniqueGrid } from "@/components/wiki/TechniqueGrid";
import { getLaunchConfig } from "@/lib/wiki-launch-config";
import { LIBELLES_TYPE } from "@/lib/techniques-types";
import { ogMeta } from "@/lib/og";
import type { Metadata } from "next";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Techniques Dragon Ball",
  description:
    "Catalogue des techniques et capacités de l'univers Dragon Ball : Kamehameha, Genkidama, Final Flash et plus.",
  ...ogMeta({
    title: "Techniques Dragon Ball — DBFR",
    description:
      "Catalogue des techniques et capacités de l'univers Dragon Ball : Kamehameha, Genkidama, Final Flash et plus.",
    canonical: "/wiki/techniques",
    type: "website",
  }),
};

export default async function TechniquesPage() {
  const [techniques, access] = await Promise.all([getShenronTechniques(), getLaunchConfig()]);

  // Charge allégée : on n'envoie au client que ce que la carte affiche, et la
  // description tronquée à ce qui tient dans deux lignes. La page rendait les
  // 825 fiches entières — 2,4 Mo de HTML mesurés en production, pour 60 cartes
  // visibles. Le reste voyageait pour rien, deux fois (DOM + charge RSC).
  const cartes = techniques.map((t) => {
    const artwork = resolveTechniqueArtwork(t);
    return {
      id: t.id,
      slug: t.slug,
      name: t.name,
      nameJa: t.nameJa,
      type: t.type,
      image: artwork?.image ?? null,
      icon: artwork?.icon ?? null,
      source: artwork?.source ?? null,
      creatorName: t.creatorName,
      description: t.description ? tronquer(t.description, 160) : null,
    };
  });

  return (
    <WikiPageShell adminBar category="techniques">
      <TechniqueCatalogueHeading count={techniques.length} />
      <TechniqueGrid techniques={cartes} libelles={LIBELLES_TYPE} access={access} />
      <ContributeRail quoiKey="kit.contribute.what.technique" />
    </WikiPageShell>
  );
}

/** Coupe sur un mot entier — une phrase tranchée en plein milieu se remarque. */
function tronquer(texte: string, max: number): string {
  const t = texte.trim();
  if (t.length <= max) return t;
  const coupe = t.slice(0, max);
  const espace = coupe.lastIndexOf(" ");
  return `${(espace > max * 0.6 ? coupe.slice(0, espace) : coupe).trimEnd()}…`;
}
