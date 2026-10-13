import type { Metadata } from "next";
import { ogMeta } from "@/lib/og";

export { default } from "@/components/episodes/EpisodesCatalogue";
export const revalidate = 3600;

const title = "Épisodes Dragon Ball — l'intégrale de l'anime";
const description =
  "Tous les épisodes Dragon Ball, DBZ, DBZ Kai, GT, Super et Daima — en VF et VOSTFR, avec vignettes, titres FR/JP et synopsis.";

export const metadata: Metadata = {
  title,
  description,
  ...ogMeta({ title, description, type: "website", canonical: "/wiki/episodes" }),
};
