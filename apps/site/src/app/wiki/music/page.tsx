import type { Metadata } from "next";
import { dbUniverse } from "@/lib/db-universe";
import { SoundtracksGrid } from "@/components/wiki/SoundtracksGrid";
import { WikiIndexPage } from "@/components/wiki/WikiIndexPage";
import { ogMeta } from "@/lib/og";
import { pageHero } from "@/lib/banner-config";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Musiques, Génériques & OST de Dragon Ball",
  description:
    "La discographie officielle et les thèmes cultes de Dragon Ball : Cha-La Head-Cha-La, Makafushigi Adventure!, Dan Dan Kokoro Hikareteku, Genkai Toppa x Survivor, Blizzard et compositions symphoniques.",
  ...ogMeta({
    title: "Musiques & Bandes Originales — Dragon Ball FR",
    description:
      "Explorez les génériques d'ouverture, chansons d'insertion des combats et thèmes orchestraux de Dragon Ball, Z, GT, Super et Daima.",
    type: "website",
    canonical: "/wiki/music",
  }),
};

export default async function SoundtracksIndexPage() {
  const soundtracks = (await dbUniverse.soundtracks()) ?? [];
  const heroImage = await pageHero("musiques");

  return (
    <WikiIndexPage
      eyebrow="Encyclopédie"
      title="Musiques, Génériques & Bandes Originales"
      lead="Des trompettes héroïques de Shunsuke Kikuchi à l'énergie rock de Hironobu Kageyama et aux compositions modernes de Zedd, vibrez au rythme de la discographie Dragon Ball."
      image={heroImage}
      imageAlt="Les guerriers de Dragon Ball Z"
      crumbs={[{ label: "Musiques & OST" }]}
      contributeKey="kit.contribute.what.music"
    >
      <div className="rounded-2xl border border-white/10 bg-gradient-to-r from-rose-950/20 via-black/40 to-transparent p-5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🎵</span>
          <div>
            <h2 className="text-sm font-bold text-white">
              Discographie & Thèmes Musicaux Officiels
            </h2>
            <p className="text-xs text-white/60">
              Chaque fiche rassemble interprète, compositeur, parolier, année et plage de diffusion.
              Les clips intégrés proviennent uniquement de chaînes officielles ; les autres titres
              proposent une recherche directe pour éviter les faux extraits.
            </p>
          </div>
        </div>
      </div>

      <SoundtracksGrid soundtracks={soundtracks} fallbackImage={heroImage} />
    </WikiIndexPage>
  );
}
