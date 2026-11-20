// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { T } from "@/components/T";
import type { Item } from "@/lib/db-universe";

interface ItemPillarSpec {
  id: string;
  accentBorder: string;
  accentBadge: string;
  accentDot: string;
  kickerKey: string;
  titleKey: string;
  titleJa: string;
  summaryKey: string;
  guideHref: string;
  guideLabel: string;
  slugs: Array<{ slug: string; fallbackLabel: string }>;
}

const ITEM_PILLARS: readonly ItemPillarSpec[] = [
  {
    id: "sacred-relics",
    accentBorder: "border-amber-500/35 bg-amber-950/[0.12]",
    accentBadge: "border-amber-400/40 bg-amber-500/15 text-amber-300",
    accentDot: "bg-amber-400",
    kickerKey: "wiki.itemsHub.pillars.relicsKicker",
    titleKey: "wiki.itemsHub.pillars.relicsTitle",
    titleJa: "神具・秘宝・ドラゴンボール・魔界の遺物",
    summaryKey: "wiki.itemsHub.pillars.relicsSummary",
    guideHref: "/wiki/databooks/4?page=196",
    guideLabel: "Daizenshuu 7, p. 196–199",
    slugs: [
      { slug: "four-star-dragon-ball-memento", fallbackLabel: "Dragon Balls & Sūshinchū" },
      { slug: "potalas", fallbackLabel: "Boucles Potalas" },
      { slug: "time-ring", fallbackLabel: "Anneaux du Temps" },
      { slug: "baton-anges-et-bouton-zeno", fallbackLabel: "Bâton des Anges & Bouton de Zeno" },
      { slug: "nyoibo", fallbackLabel: "Bâton Magique (Nyoi-Bō)" },
      { slug: "kintoun", fallbackLabel: "Nuage Magique (Kintōun)" },
      { slug: "mafuba-jar", fallbackLabel: "Urnes & Autocuiseur du Mafūba" },
      { slug: "katchin-metal", fallbackLabel: "Acier Katchin & Kachi Katchin" },
      { slug: "troisieme-oeil-malefique", fallbackLabel: "Troisième Œil Démoniaque" },
    ],
  },
  {
    id: "super-science",
    accentBorder: "border-sky-500/35 bg-sky-950/[0.12]",
    accentBadge: "border-sky-400/40 bg-sky-500/15 text-sky-300",
    accentDot: "bg-sky-400",
    kickerKey: "wiki.itemsHub.pillars.scienceKicker",
    titleKey: "wiki.itemsHub.pillars.scienceTitle",
    titleJa: "超科学・ホイポイカプセル・スカウター・タイムマシン",
    summaryKey: "wiki.itemsHub.pillars.scienceSummary",
    guideHref: "/wiki/databooks/3?page=145",
    guideLabel: "Daizenshuu 4, p. 145–150",
    slugs: [
      { slug: "capsules-hoi-poi", fallbackLabel: "Capsules Hoi-Poi" },
      { slug: "dragon-radar", fallbackLabel: "Dragon Radar & Giru" },
      { slug: "time-machine", fallbackLabel: "Machine Temporelle (HOPE!!)" },
      { slug: "scouter", fallbackLabel: "Scouters (Ancien & Nouveau)" },
      { slug: "cyborg-shutoff-remote", fallbackLabel: "Télécommande & Plans Cyborgs" },
      { slug: "generateur-ondes-blutz", fallbackLabel: "Générateur d'Ondes Blutz" },
      { slug: "great-saiyaman-watch", fallbackLabel: "Montre Saiyaman & Micro-Band" },
      { slug: "spopovich-energy-absorber", fallbackLabel: "Absorbeur & Kili-Mètre" },
    ],
  },
  {
    id: "vehicles-fleets",
    accentBorder: "border-purple-500/35 bg-purple-950/[0.12]",
    accentBadge: "border-purple-400/40 bg-purple-500/15 text-purple-300",
    accentDot: "bg-purple-400",
    kickerKey: "wiki.itemsHub.pillars.vehiclesKicker",
    titleKey: "wiki.itemsHub.pillars.vehiclesTitle",
    titleJa: "宇宙船・反重力航空機・エアカー・RR軍メカ",
    summaryKey: "wiki.itemsHub.pillars.vehiclesSummary",
    guideHref: "/wiki/databooks/3?page=124",
    guideLabel: "Daizenshuu 4, p. 124–140",
    slugs: [
      { slug: "gravity-spaceship", fallbackLabel: "Vaisseau Spatial 100G & Salle 300G" },
      { slug: "saiyan-space-pod", fallbackLabel: "Capsule Spatiale Saiyenne" },
      { slug: "kami-spaceship", fallbackLabel: "Vaisseau Namek & Takogata" },
      {
        slug: "vaisseaux-empire-freezer-et-babidi",
        fallbackLabel: "Vaisseaux de Freezer & Babidi",
      },
      { slug: "avions-capsule-corporation", fallbackLabel: "Avions & Jets Capsule Corp" },
      { slug: "air-cars-et-jet-momonga", fallbackLabel: "Air Cars & Jet Momonga" },
      { slug: "motos-capsules-et-air-bikes", fallbackLabel: "Moto Capsule n° 9 & Air Bikes" },
      { slug: "pilaf-robo-et-battle-jacket", fallbackLabel: "Pilaf Machine & Battle Jacket" },
    ],
  },
  {
    id: "weapons-armor",
    accentBorder: "border-rose-500/35 bg-rose-950/[0.12]",
    accentBadge: "border-rose-400/40 bg-rose-500/15 text-rose-300",
    accentDot: "bg-rose-400",
    kickerKey: "wiki.itemsHub.pillars.weaponsKicker",
    titleKey: "wiki.itemsHub.pillars.weaponsTitle",
    titleJa: "伝説の刀剣・戦闘ジャケット・修業用防具",
    summaryKey: "wiki.itemsHub.pillars.weaponsSummary",
    guideHref: "/wiki/databooks/3?page=152",
    guideLabel: "Daizenshuu 4, p. 151–157",
    slugs: [
      { slug: "z-sword", fallbackLabel: "Épée Z (Z-Sword)" },
      { slug: "epee-trunks-et-tapion", fallbackLabel: "Épée de Trunks & Tapion" },
      { slug: "saiyan-armor-standard", fallbackLabel: "Armures de Combat Saiyennes" },
      { slug: "weighted-undershirt", fallbackLabel: "Tenues Lestées & Dogi" },
      { slug: "turtle-shell-weights", fallbackLabel: "Carapaces & Lunettes de Roshi" },
      { slug: "lames-et-armes-martiales", fallbackLabel: "Katana de Yajirobé & Lames" },
      { slug: "arsenal-militaire-et-outils-ninja", fallbackLabel: "Arsenal Militaire & Ninja" },
    ],
  },
  {
    id: "medical-biotech",
    accentBorder: "border-emerald-500/35 bg-emerald-950/[0.12]",
    accentBadge: "border-emerald-400/40 bg-emerald-500/15 text-emerald-300",
    accentDot: "bg-emerald-400",
    kickerKey: "wiki.itemsHub.pillars.medicalKicker",
    titleKey: "wiki.itemsHub.pillars.medicalTitle",
    titleJa: "仙豆・超神水・メディカルマシーン・特効薬",
    summaryKey: "wiki.itemsHub.pillars.medicalSummary",
    guideHref: "/wiki/databooks/3?page=157",
    guideLabel: "Daizenshuu 4, p. 150 & 157–158",
    slugs: [
      { slug: "senzu", fallbackLabel: "Haricots Senzu & Kusuri Mushi" },
      { slug: "ultra-divine-water", fallbackLabel: "Eau Ultra Divine (Chōshinsui)" },
      { slug: "medical-regeneration-tank", fallbackLabel: "Cuve Médicale de Régénération" },
      { slug: "antidote-virus-cardiaque-et-biotech", fallbackLabel: "Remède Cardiaque & Biotech" },
    ],
  },
] as const;

const ITEM_LAWS = [
  {
    key: "capsules",
    titleKey: "wiki.itemsHub.laws.capsulesTitle",
    bodyKey: "wiki.itemsHub.laws.capsulesBody",
    sourceHref: "/wiki/databooks/3?page=147",
    sourceLabel: "Daizenshuu 4, p. 147 · CZ4, p. 221",
  },
  {
    key: "antigravity",
    titleKey: "wiki.itemsHub.laws.antigravityTitle",
    bodyKey: "wiki.itemsHub.laws.antigravityBody",
    sourceHref: "/wiki/databooks/3?page=138",
    sourceLabel: "Daizenshuu 4, p. 125 & 138",
  },
  {
    key: "chronotech",
    titleKey: "wiki.itemsHub.laws.chronotechTitle",
    bodyKey: "wiki.itemsHub.laws.chronotechBody",
    sourceHref: "/wiki/databooks/19?page=28",
    sourceLabel: "Chōzenshū 4, p. 28 & 219 · DBS #54",
  },
  {
    key: "detection",
    titleKey: "wiki.itemsHub.laws.detectionTitle",
    bodyKey: "wiki.itemsHub.laws.detectionBody",
    sourceHref: "/wiki/databooks/3?page=149",
    sourceLabel: "Daizenshuu 4, p. 145 & 149",
  },
  {
    key: "sacred-magic",
    titleKey: "wiki.itemsHub.laws.sacredTitle",
    bodyKey: "wiki.itemsHub.laws.sacredBody",
    sourceHref: "/wiki/databooks/19?page=222",
    sourceLabel: "Chōzenshū 4, p. 206 & 222 · DBS #66",
  },
  {
    key: "biomed",
    titleKey: "wiki.itemsHub.laws.biomedTitle",
    bodyKey: "wiki.itemsHub.laws.biomedBody",
    sourceHref: "/wiki/databooks/4?page=191",
    sourceLabel: "Daizenshuu 7, p. 189, 191 & 212",
  },
] as const;

export function ItemsAtlas({ items }: { items: readonly Item[] }) {
  const bySlug = new Map(items.map((it) => [it.slug, it]));

  return (
    <section id="arsenal-et-technologies" className="space-y-8">
      <div className="dbz-panel space-y-6 border-t-4 border-t-dbz-orange p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-5">
          <div className="max-w-3xl space-y-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-dbz-orange/40 bg-dbz-orange/10 px-3 py-1 font-scouter text-[10px] uppercase tracking-[0.2em] text-dbz-orange">
              <T k="wiki.itemsHub.atlasBadge" />
            </span>
            <h2 className="font-saiyan text-3xl uppercase tracking-wider text-white sm:text-4xl">
              <T k="wiki.itemsHub.atlasHeading" />
            </h2>
            <p className="text-sm leading-relaxed text-white/75 sm:text-base">
              <T k="wiki.itemsHub.atlasLead" />
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/wiki/databooks/4?page=169"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-dbz-orange/40 bg-dbz-orange/15 px-3.5 py-2 font-mono text-xs font-bold text-dbz-orange transition-colors hover:bg-dbz-orange hover:text-black"
            >
              <span>Daizenshuu 7 (p. 169–216)</span>
              <span aria-hidden>→</span>
            </Link>
            <Link
              href="/wiki/databooks/19?page=177"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3.5 py-2 font-mono text-xs text-white/80 transition-colors hover:border-dbz-blue/50 hover:text-white"
            >
              <span>Chōzenshū 4 (p. 177–232)</span>
              <span aria-hidden>→</span>
            </Link>
            <Link
              href="/wiki/databooks/3?page=124"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3.5 py-2 font-mono text-xs text-white/80 transition-colors hover:border-dbz-blue/50 hover:text-white"
            >
              <span>Machines D4 (p. 124–158)</span>
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>

        <div className="space-y-3">
          {ITEM_PILLARS.map((pillar, index) => {
            const linked = pillar.slugs.map((s) => ({
              slug: s.slug,
              item: bySlug.get(s.slug),
              fallbackLabel: s.fallbackLabel,
            }));

            return (
              <div
                key={pillar.id}
                className={`rounded-2xl border p-4 transition-colors sm:p-5 ${pillar.accentBorder}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${pillar.accentDot}`} aria-hidden />
                      <span
                        className={`rounded-xs border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${pillar.accentBadge}`}
                      >
                        {String(index + 1).padStart(2, "0")} · <T k={pillar.kickerKey} />
                      </span>
                      <span lang="ja" className="font-jp text-xs text-white/50">
                        {pillar.titleJa}
                      </span>
                    </div>
                    <h3 className="text-base font-extrabold text-white sm:text-lg">
                      <T k={pillar.titleKey} />
                    </h3>
                  </div>
                  <Link
                    href={pillar.guideHref}
                    className="shrink-0 rounded-md border border-white/12 bg-black/40 px-2.5 py-1 font-mono text-[11px] text-dbz-blue-light transition-colors hover:border-dbz-orange/50 hover:text-dbz-orange"
                  >
                    {pillar.guideLabel} →
                  </Link>
                </div>

                <p className="mt-2.5 text-xs leading-relaxed text-white/75 sm:text-sm">
                  <T k={pillar.summaryKey} />
                </p>

                <div className="mt-3.5 flex flex-wrap gap-2">
                  {linked.map(({ slug, item, fallbackLabel }) =>
                    item ? (
                      <Link
                        key={slug}
                        href={`/wiki/items/${item.slug}`}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/15 bg-black/50 px-3.5 py-1.5 text-xs font-semibold text-white/90 transition-all hover:border-dbz-orange hover:bg-dbz-orange/15 hover:text-white"
                      >
                        <span>{item.name}</span>
                        <span className="text-dbz-orange" aria-hidden>
                          →
                        </span>
                      </Link>
                    ) : (
                      <span
                        key={slug}
                        className="inline-flex min-h-9 items-center rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-white/55"
                      >
                        {fallbackLabel}
                      </span>
                    ),
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-4">
            <h3 className="font-mono text-xs font-bold uppercase tracking-[0.22em] text-dbz-orange">
              <T k="wiki.itemsHub.lawsHeading" />
            </h3>
            <div className="h-px flex-1 bg-gradient-to-r from-dbz-orange/35 to-transparent" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ITEM_LAWS.map((law) => (
              <div
                key={law.key}
                className="flex flex-col justify-between space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="space-y-1.5">
                  <h4 className="text-sm font-bold text-white">
                    <T k={law.titleKey} />
                  </h4>
                  <p className="text-xs leading-relaxed text-white/70">
                    <T k={law.bodyKey} />
                  </p>
                </div>
                <Link
                  href={law.sourceHref}
                  className="inline-flex items-center gap-1 font-mono text-[11px] text-dbz-blue-light transition-colors hover:text-dbz-orange hover:underline"
                >
                  <span>{law.sourceLabel}</span>
                  <span aria-hidden>→</span>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
