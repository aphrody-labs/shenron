import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { T } from "@/components/T";
import { KiEncyclopediaSection } from "@/components/wiki/KiEncyclopediaSection";
import { PowerLevelsTable } from "@/components/wiki/PowerLevelsTable";
import {
  WikiCanonicalFooter,
  type CanonicalFactEntry,
} from "@/components/wiki/WikiCanonicalFooter";
import { WikiIndexPage } from "@/components/wiki/WikiIndexPage";
import { pageHero } from "@/lib/banner-config";
import { dbUniverse } from "@/lib/db-universe";
import { ogMeta } from "@/lib/og";
import type { WikiSource } from "@/lib/shenron";
import { getLaunchConfig } from "@/lib/wiki-launch-config";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("wiki.kiEncyclopedia.page");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    ...ogMeta({
      title: t("ogTitle"),
      description: t("ogDescription"),
      canonical: "/wiki/power-levels",
      type: "website",
    }),
  };
}

const POWER_LEVELS_SOURCES: readonly WikiSource[] = [
  {
    n: 1,
    kind: "databook",
    label:
      "Super Exciting Guide : Story Volume, planche 92 — Entretien d'Akira Toriyama sur la triade du Ki (Genki, Yūki, Shōki)",
    url: "/wiki/databooks/9?page=92",
  },
  {
    n: 2,
    kind: "databook",
    label:
      "Super Exciting Guide : Story Volume, planche 58 — Entraînement mental (Image Training) élevant le plafond maximal du Ki",
    url: "/wiki/databooks/9?page=58",
  },
  {
    n: 3,
    kind: "databook",
    label:
      "Super Exciting Guide : Character Volume, planche 74 — Amplification focale du Ki de tout le corps au creux des paumes",
    url: "/wiki/databooks/6?page=74",
  },
  {
    n: 4,
    kind: "databook",
    label:
      "Chōzenshū 1 : Story & World Guide, planche 31 — Franchir les limites physiques du corps par l'augmentation et le contrôle du Ki",
    url: "/wiki/databooks/16?page=31",
  },
  {
    n: 5,
    kind: "databook",
    label:
      "Chōzenshū 4 : Super Encyclopedia, planche 49 — Entrée encyclopédique « Ki » et nature imperceptible du Ki Divin",
    url: "/wiki/databooks/19?page=49",
  },
  {
    n: 6,
    kind: "databook",
    label:
      "Daizenshuu 7 : Daijiten, planches 124 et 151–152 — Ondes Blutz (17 millions de Zenos), Power Ball et règle du double de Ki de la Barrière",
    url: "/wiki/databooks/4?page=151",
  },
  {
    n: 7,
    kind: "databook",
    label:
      "Chōzenshū 4 : Super Encyclopedia, planches 165–166 — Barrière de Ki (émission au moins double de celle de l'adversaire) et Power Ball",
    url: "/wiki/databooks/19?page=166",
  },
  {
    n: 8,
    kind: "episode",
    label:
      "Anime Dragon Ball, épisode 129 « Voyage » (transcription VO 00:13:49 & 00:14:47 : enseignement originel de Maître Mutaito sur le Ki et la concentration)",
    url: "/wiki/episodes/129",
  },
  {
    n: 9,
    kind: "episode",
    label:
      "Anime Dragon Ball Z, épisode 207 « Comment taquiner les oiseaux ? » (transcription VO 00:03:36–00:03:50 : cours de Gohan à Videl et Goten sur le Ki)",
    url: "/wiki/episodes/360",
  },
  {
    n: 10,
    kind: "manga_chapter",
    label:
      "Manga Dragon Ball, chapitre 515 « Pas assez d'énergie pour le Genki Dama » (collecte volontaire du Genki universel, incluant C-17)",
    url: "/wiki/manga/20515",
  },
  {
    n: 11,
    kind: "manga_chapter",
    label:
      "Manga Dragon Ball Super, chapitre 52 (contrôle de l'Esprit / Spirit Control sur la Planète Yardrat)",
    url: "/wiki/manga/1366",
  },
  {
    n: 12,
    kind: "episode",
    label:
      "Anime Dragon Ball GT, épisode 48 « L'imposteur » (transcription VO 00:09:21–00:10:20 : Énergie Plus et Énergie Moins des Dragon Balls)",
    url: "/wiki/episodes/605",
  },
  {
    n: 13,
    kind: "episode",
    label:
      "Anime Dragon Ball Daima, épisode 1 « Complot » (transcription VO 00:04:30 & 00:13:49 : Magie du Dai Makai, magie blanche et magie noire)",
    url: "/wiki/episodes/545",
  },
  {
    n: 14,
    kind: "movie",
    label:
      "Film Dragon Ball Z : Fusions / Fusion Reborn (transcription VO 00:04:40 & 00:07:30 : cristallisation du Jaki maléfique en Janemba)",
    url: "/wiki/movies/fusion-reborn",
  },
  {
    n: 15,
    kind: "movie",
    label:
      "Film Dragon Ball Super : Super Hero (transcription VO 00:29:47–00:30:20 : méditation de Vegeta sur l'économie et l'explosion instantanée du Ki chez Jiren)",
    url: "/wiki/movies/dragon-ball-super-super-hero",
  },
  {
    n: 16,
    kind: "episode",
    label:
      "Anime Dragon Ball Super, épisode 110 (transcription VO 00:09:53 & 00:18:00 : éveil de l'Ultra Instinct et ébranlement du Monde du Vide)",
    url: "/wiki/episodes/631",
  },
];

export default async function PuissancesPage() {
  const [powersData, launch, t] = await Promise.all([
    dbUniverse.powerLevels(),
    getLaunchConfig().catch(() => null),
    getTranslations("wiki.kiEncyclopedia.page"),
  ]);
  const powers = powersData ?? [];
  const access = launch ? { openKeys: launch.openKeys, access: launch.access } : null;

  const canonicalFacts: CanonicalFactEntry[] = [
    {
      key: "spiritual-triad",
      label: <T k="wiki.kiEncyclopedia.facts.triadLabel" />,
      value: <T k="wiki.kiEncyclopedia.facts.triadValue" />,
      href: "/wiki/databooks/9?page=92",
    },
    {
      key: "scouter-archive",
      label: <T k="wiki.kiEncyclopedia.facts.scouterLabel" />,
      value: t("scouterCount", { count: powers.length }),
      href: "/wiki/databooks/4?page=49",
    },
    {
      key: "divine-paths",
      label: <T k="wiki.kiEncyclopedia.facts.divineLabel" />,
      value: <T k="wiki.kiEncyclopedia.facts.divineValue" />,
      href: "/wiki/databooks/19?page=49",
    },
  ];

  return (
    <WikiIndexPage
      eyebrow={t("eyebrow")}
      title={t("title")}
      lead={t("lead", { count: powers.length })}
      image={await pageHero("puissances")}
      imageAlt={t("imageAlt")}
      crumbs={[{ label: t("crumb") }]}
      category="power-levels"
      contributeKey="kit.contribute.what.power"
    >
      <div className="space-y-10">
        <KiEncyclopediaSection />

        <div className="space-y-4">
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-xs leading-relaxed text-amber-200/80">
            <strong>
              <T k="wiki.kiEncyclopedia.page.doctrineTitle" />
            </strong>{" "}
            <T k="wiki.kiEncyclopedia.page.doctrineBody" />
          </div>

          <PowerLevelsTable powers={powers} access={access} />
        </div>

        <WikiCanonicalFooter facts={canonicalFacts} sources={POWER_LEVELS_SOURCES} />
      </div>
    </WikiIndexPage>
  );
}
