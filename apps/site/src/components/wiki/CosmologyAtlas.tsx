// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { T } from "@/components/T";
import { WikiImg } from "@/components/wiki/WikiImg";
import type { Location } from "@/lib/db-universe";

const COSMOLOGY_REALM_RE =
  /^(?:cosmologie|sommet multiversel|monde du vide|divin|royaume des morts|autre monde|royaume d[ée]moniaque|makai|dimension)/i;

export function isCosmologyLocation(loc: Pick<Location, "realm_type" | "slug">): boolean {
  if (COSMOLOGY_REALM_RE.test(loc.realm_type)) return true;
  return [
    "macrocosme-univers-7",
    "monde-des-vivants",
    "autre-monde",
    "palais-enma",
    "chemin-du-serpent",
    "paradis-et-planete-grand-kaio",
    "enfer",
    "planete-kaio",
    "domaine-kaioshin",
    "royaume-des-demons",
    "planete-beerus",
    "salle-esprit-temps",
    "palais-zeno",
    "arene-monde-du-vide",
  ].includes(loc.slug);
}

const COSMOLOGY_PRIORITY_ORDER: Record<string, number> = {
  "macrocosme-univers-7": 1,
  "palais-zeno": 2,
  "arene-monde-du-vide": 3,
  "domaine-kaioshin": 4,
  "planete-beerus": 5,
  "autre-monde": 6,
  "paradis-et-planete-grand-kaio": 7,
  "palais-enma": 8,
  "chemin-du-serpent": 9,
  "planete-kaio": 10,
  enfer: 11,
  "monde-des-vivants": 12,
  "royaume-des-demons": 13,
  "salle-esprit-temps": 14,
};

interface StratumSpec {
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

const COSMIC_STRATA: readonly StratumSpec[] = [
  {
    id: "multiverse",
    accentBorder: "border-purple-500/35 bg-purple-950/[0.12]",
    accentBadge: "border-purple-400/40 bg-purple-500/15 text-purple-300",
    accentDot: "bg-purple-400",
    kickerKey: "wiki.locationsHub.strata.multiverseKicker",
    titleKey: "wiki.locationsHub.strata.multiverseTitle",
    titleJa: "全12宇宙・全王の領域・無の界",
    summaryKey: "wiki.locationsHub.strata.multiverseSummary",
    guideHref: "/wiki/databooks/30?page=2",
    guideLabel: "DB Super Start Guide, p. 2",
    slugs: [
      { slug: "palais-zeno", fallbackLabel: "Palais du Roi Zeno" },
      { slug: "arene-monde-du-vide", fallbackLabel: "Monde du Vide" },
      { slug: "macrocosme-univers-7", fallbackLabel: "Macrocosme (Univers 7)" },
    ],
  },
  {
    id: "sovereign-gods",
    accentBorder: "border-amber-500/35 bg-amber-950/[0.12]",
    accentBadge: "border-amber-400/40 bg-amber-500/15 text-amber-300",
    accentDot: "bg-amber-400",
    kickerKey: "wiki.locationsHub.strata.sovereignKicker",
    titleKey: "wiki.locationsHub.strata.sovereignTitle",
    titleJa: "界王神界・界芯星 ＆ ビルスの星",
    summaryKey: "wiki.locationsHub.strata.sovereignSummary",
    guideHref: "/wiki/databooks/16?page=18",
    guideLabel: "Chōzenshū 1, p. 18",
    slugs: [
      { slug: "domaine-kaioshin", fallbackLabel: "Domaine Sacré des Kaiōshin" },
      { slug: "planete-beerus", fallbackLabel: "Planète de Beerus" },
    ],
  },
  {
    id: "other-world",
    accentBorder: "border-sky-500/35 bg-sky-950/[0.12]",
    accentBadge: "border-sky-400/40 bg-sky-500/15 text-sky-300",
    accentDot: "bg-sky-400",
    kickerKey: "wiki.locationsHub.strata.otherWorldKicker",
    titleKey: "wiki.locationsHub.strata.otherWorldTitle",
    titleJa: "あの世（天国・大界王星・界王星・蛇の道・閻魔界・地獄）",
    summaryKey: "wiki.locationsHub.strata.otherWorldSummary",
    guideHref: "/wiki/databooks/3?page=71",
    guideLabel: "Daizenshuu 4, p. 71–72",
    slugs: [
      { slug: "autre-monde", fallbackLabel: "Autre Monde (Ano Yo)" },
      { slug: "paradis-et-planete-grand-kaio", fallbackLabel: "Paradis & Grand Kaiō" },
      { slug: "palais-enma", fallbackLabel: "Palais du Roi Enma" },
      { slug: "chemin-du-serpent", fallbackLabel: "Route du Serpent" },
      { slug: "planete-kaio", fallbackLabel: "Planète de Kaiō du Nord" },
      { slug: "enfer", fallbackLabel: "Enfer (Jigoku)" },
    ],
  },
  {
    id: "living-world",
    accentBorder: "border-emerald-500/35 bg-emerald-950/[0.12]",
    accentBadge: "border-emerald-400/40 bg-emerald-500/15 text-emerald-300",
    accentDot: "bg-emerald-400",
    kickerKey: "wiki.locationsHub.strata.livingWorldKicker",
    titleKey: "wiki.locationsHub.strata.livingWorldTitle",
    titleJa: "この世・宇宙（北・南・東・西の四銀河）",
    summaryKey: "wiki.locationsHub.strata.livingWorldSummary",
    guideHref: "/wiki/databooks/3?page=19",
    guideLabel: "Daizenshuu 4, p. 19–20",
    slugs: [
      { slug: "monde-des-vivants", fallbackLabel: "Monde des Vivants (4 Galaxies)" },
      { slug: "planete-namek", fallbackLabel: "Planète Namek" },
      { slug: "nouvelle-planete-namek", fallbackLabel: "Nouvelle Namek" },
      { slug: "planete-vegeta", fallbackLabel: "Planète Vegeta" },
      { slug: "planete-yardrat", fallbackLabel: "Planète Yardrat" },
      { slug: "sanctuaire-de-dieu", fallbackLabel: "Sanctuaire de Dieu (Terre)" },
    ],
  },
  {
    id: "demon-dimensions",
    accentBorder: "border-rose-500/35 bg-rose-950/[0.12]",
    accentBadge: "border-rose-400/40 bg-rose-500/15 text-rose-300",
    accentDot: "bg-rose-400",
    kickerKey: "wiki.locationsHub.strata.demonKicker",
    titleKey: "wiki.locationsHub.strata.demonTitle",
    titleJa: "大魔界（暗黒魔界）＆ 異空間・精神と時の部屋",
    summaryKey: "wiki.locationsHub.strata.demonSummary",
    guideHref: "/wiki/databooks/19?page=35",
    guideLabel: "Chōzenshū 4, p. 35 & D4, p. 80",
    slugs: [
      { slug: "royaume-des-demons", fallbackLabel: "Royaume des Démons (Makai)" },
      { slug: "salle-esprit-temps", fallbackLabel: "Salle de l'Esprit et du Temps" },
    ],
  },
];

const COSMIC_LAWS = [
  {
    key: "infinity",
    titleKey: "wiki.locationsHub.laws.infinityTitle",
    bodyKey: "wiki.locationsHub.laws.infinityBody",
    sourceHref: "/wiki/databooks/4?page=42",
    sourceLabel: "Daizenshuu 7, p. 42 · DBZ #269",
  },
  {
    key: "dimensions",
    titleKey: "wiki.locationsHub.laws.dimensionsTitle",
    bodyKey: "wiki.locationsHub.laws.dimensionsBody",
    sourceHref: "/wiki/databooks/3?page=17",
    sourceLabel: "Daizenshuu 4, p. 17 · SEG, p. 59",
  },
  {
    key: "time",
    titleKey: "wiki.locationsHub.laws.timeTitle",
    bodyKey: "wiki.locationsHub.laws.timeBody",
    sourceHref: "/wiki/databooks/3?page=80",
    sourceLabel: "Daizenshuu 4, p. 80",
  },
  {
    key: "souls",
    titleKey: "wiki.locationsHub.laws.soulsTitle",
    bodyKey: "wiki.locationsHub.laws.soulsBody",
    sourceHref: "/wiki/databooks/19?page=36",
    sourceLabel: "Chōzenshū 4, p. 36",
  },
  {
    key: "travel",
    titleKey: "wiki.locationsHub.laws.travelTitle",
    bodyKey: "wiki.locationsHub.laws.travelBody",
    sourceHref: "/wiki/databooks/3?page=54",
    sourceLabel: "Daizenshuu 4, p. 54",
  },
  {
    key: "balance",
    titleKey: "wiki.locationsHub.laws.balanceTitle",
    bodyKey: "wiki.locationsHub.laws.balanceBody",
    sourceHref: "/wiki/databooks/16?page=18",
    sourceLabel: "Chōzenshū 1, p. 18 & 31",
  },
] as const;

export function CosmologyAtlas({ locations }: { locations: readonly Location[] }) {
  const bySlug = new Map(locations.map((l) => [l.slug, l]));
  const cosmologyCards = locations
    .filter((l) => isCosmologyLocation(l))
    .toSorted(
      (a, b) =>
        (COSMOLOGY_PRIORITY_ORDER[a.slug] ?? 999) - (COSMOLOGY_PRIORITY_ORDER[b.slug] ?? 999) ||
        a.name.localeCompare(b.name, "fr"),
    );

  return (
    <section id="cosmologie" className="space-y-8">
      {/* Architecture du Macrocosme & des 5 Strates */}
      <div className="dbz-panel space-y-6 border-t-4 border-t-dbz-orange p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-5">
          <div className="space-y-2 max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-dbz-orange/40 bg-dbz-orange/10 px-3 py-1 font-scouter text-[10px] uppercase tracking-[0.2em] text-dbz-orange">
              <T k="wiki.locationsHub.cosmologyBadge" />
            </span>
            <h2 className="font-saiyan text-3xl uppercase tracking-wider text-white sm:text-4xl">
              <T k="wiki.locationsHub.cosmologyHeading" />
            </h2>
            <p className="text-sm leading-relaxed text-white/75 sm:text-base">
              <T k="wiki.locationsHub.cosmologyLead" />
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/wiki/databooks/3?page=71"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-dbz-orange/40 bg-dbz-orange/15 px-3.5 py-2 font-mono text-xs font-bold text-dbz-orange transition-colors hover:bg-dbz-orange hover:text-black"
            >
              <span>Daizenshuu 4 (p. 71–72)</span>
              <span aria-hidden>→</span>
            </Link>
            <Link
              href="/wiki/databooks/3?page=10"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3.5 py-2 font-mono text-xs text-white/80 transition-colors hover:border-dbz-blue/50 hover:text-white"
            >
              <span>Croquis Toriyama (D4 p. 10)</span>
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>

        {/* Diagramme vertical des 5 strates cosmologiques */}
        <div className="space-y-3">
          {COSMIC_STRATA.map((stratum, index) => {
            const linked = stratum.slugs.map((s) => ({
              slug: s.slug,
              loc: bySlug.get(s.slug),
              fallbackLabel: s.fallbackLabel,
            }));

            return (
              <div
                key={stratum.id}
                className={`rounded-2xl border p-4 sm:p-5 transition-colors ${stratum.accentBorder}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${stratum.accentDot}`} aria-hidden />
                      <span
                        className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider border ${stratum.accentBadge}`}
                      >
                        {String(index + 1).padStart(2, "0")} · <T k={stratum.kickerKey} />
                      </span>
                      <span lang="ja" className="font-jp text-xs text-white/50">
                        {stratum.titleJa}
                      </span>
                    </div>
                    <h3 className="text-base font-extrabold text-white sm:text-lg">
                      <T k={stratum.titleKey} />
                    </h3>
                  </div>
                  <Link
                    href={stratum.guideHref}
                    className="shrink-0 rounded-md border border-white/12 bg-black/40 px-2.5 py-1 font-mono text-[11px] text-dbz-blue-light transition-colors hover:border-dbz-orange/50 hover:text-dbz-orange"
                  >
                    {stratum.guideLabel} →
                  </Link>
                </div>

                <p className="mt-2.5 text-xs leading-relaxed text-white/75 sm:text-sm">
                  <T k={stratum.summaryKey} />
                </p>

                <div className="mt-3.5 flex flex-wrap gap-2">
                  {linked.map(({ slug, loc, fallbackLabel }) =>
                    loc ? (
                      <Link
                        key={slug}
                        href={`/wiki/locations/${loc.slug}`}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/15 bg-black/50 px-3.5 py-1.5 text-xs font-semibold text-white/90 transition-all hover:border-dbz-orange hover:bg-dbz-orange/15 hover:text-white"
                      >
                        <span>{loc.name}</span>
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

        {/* Lois spatiales, temporelles et spirituelles */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-4">
            <h3 className="font-mono text-xs font-bold uppercase tracking-[0.22em] text-dbz-orange">
              <T k="wiki.locationsHub.lawsHeading" />
            </h3>
            <div className="h-px flex-1 bg-gradient-to-r from-dbz-orange/35 to-transparent" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {COSMIC_LAWS.map((law) => (
              <div
                key={law.key}
                className="flex flex-col justify-between rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3"
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
                  className="inline-flex items-center gap-1 font-mono text-[11px] text-dbz-blue-light hover:text-dbz-orange hover:underline transition-colors"
                >
                  <span>{law.sourceLabel}</span>
                  <span aria-hidden>→</span>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Dossiers prioritaires de l'Espace Cosmologie */}
      {cosmologyCards.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1">
              <p className="font-scouter text-[10px] uppercase tracking-[0.2em] text-dbz-orange">
                <T k="wiki.locationsHub.cosmologyCardsKicker" />
              </p>
              <h2 className="font-saiyan text-2xl uppercase tracking-wider text-white sm:text-3xl">
                <T
                  k="wiki.locationsHub.cosmologyCardsHeading"
                  values={{ count: cosmologyCards.length }}
                />
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cosmologyCards.map((loc) => (
              <Link
                key={loc.slug}
                href={`/wiki/locations/${loc.slug}`}
                className="group dbz-panel flex flex-col overflow-hidden transition-all duration-200 hover:border-dbz-orange/60"
              >
                <div className="relative aspect-[16/9] w-full overflow-hidden border-b border-white/10 bg-black">
                  {loc.image ? (
                    <WikiImg
                      src={loc.image}
                      alt={loc.name}
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 380px"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      placeholderClassName="flex h-full w-full items-center justify-center bg-zinc-950"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-900 via-black to-zinc-950 font-jp text-2xl font-bold text-dbz-orange/35">
                      {loc.name_ja ?? "天界"}
                    </div>
                  )}
                  <span className="absolute left-3 top-3 rounded bg-black/80 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-dbz-orange backdrop-blur-sm border border-dbz-orange/35">
                    {loc.realm_type}
                  </span>
                </div>
                <div className="flex flex-1 flex-col justify-between p-4 sm:p-5 space-y-3">
                  <div className="space-y-1.5">
                    <h3 className="text-base font-extrabold text-white group-hover:text-dbz-orange transition-colors">
                      {loc.name}
                    </h3>
                    {loc.name_ja && (
                      <p lang="ja" className="font-jp text-xs text-white/50">
                        {loc.name_ja}
                        {loc.name_romaji ? ` · ${loc.name_romaji}` : ""}
                      </p>
                    )}
                    <p className="line-clamp-3 text-xs leading-relaxed text-white/70">
                      {loc.description}
                    </p>
                  </div>
                  <div className="flex items-center justify-between border-t border-white/10 pt-3 text-[11px] font-mono text-white/50">
                    <span className="truncate">{loc.debut_chapter ?? loc.planet ?? "DBFR"}</span>
                    <span className="shrink-0 font-bold text-dbz-orange group-hover:translate-x-0.5 transition-transform">
                      <T k="wiki.locationsHub.readCosmologyFile" /> →
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
