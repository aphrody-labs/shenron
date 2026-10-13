import type { Metadata } from "next";
import { HomeView } from "@/components/home/HomeView";
import { getHomeConfig } from "@/lib/home-config";
import { getLaunchConfig } from "@/lib/wiki-launch-config";
import { ogMeta } from "@/lib/og";

export const revalidate = 900;
export const metadata: Metadata = {
  title: {
    absolute: "DBFR — L'encyclopédie Dragon Ball",
  },
  description:
    "Dragon Ball en français : personnages, sagas, films, manga et actualités, sourcés sur le manga.",
  ...ogMeta({
    title: "DBFR — L'encyclopédie Dragon Ball",
    description: "Dragon Ball en français : personnages, sagas, films, manga et actualités.",
    type: "website",
    canonical: "/",
  }),
};

export default async function HomePage() {
  const [config, access] = await Promise.all([
    getHomeConfig(),
    getLaunchConfig().catch(() => null),
  ]);
  return <HomeView config={config} access={access} />;
}
