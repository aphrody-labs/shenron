// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { T } from "@/components/T";

interface KiQuoteSpec {
  id: string;
  ja: string;
  translationKey: string;
  sourceHref: string;
  sourceLabelKey: string;
}

interface KiComponentSpec {
  id: string;
  badge: string;
  kanji: string;
  accentBorder: string;
  accentBadge: string;
  titleKey: string;
  bodyKey: string;
  links: Array<{ href: string; labelKey: string }>;
}

interface KiLawSpec {
  id: string;
  titleKey: string;
  bodyKey: string;
  sourceHref: string;
  sourceLabelKey: string;
}

interface KiFormSpec {
  id: string;
  kanji: string;
  accentText: string;
  eraKey: string;
  titleKey: string;
  bodyKey: string;
  sourceHref: string;
  sourceLabelKey: string;
}

const KI_QUOTES: readonly KiQuoteSpec[] = [
  {
    id: "toriyama-triad",
    ja: "闘いにおいてもっとも重要なのは、気の大きさと、そのコントロールです。「気」というものにはもちろん、元気や勇気、正気といった精神力も含まれています。肉体的な強さにはどう鍛えても限界があり、それを超えるには「気」しかないのです。",
    translationKey: "wiki.kiEncyclopedia.quotes.toriyamaTriadText",
    sourceHref: "/wiki/databooks/9?page=92",
    sourceLabelKey: "wiki.kiEncyclopedia.quotes.toriyamaTriadSource",
  },
  {
    id: "chozenshu-limits",
    ja: "肉体そのものの強さには物理的な限界があるので、「気」の壁を越えるには「気」の増大が必要です。通常、気を増大させるほどコントロールが難しくなるので、気のコントロールも重要ですね。",
    translationKey: "wiki.kiEncyclopedia.quotes.chozenshuLimitsText",
    sourceHref: "/wiki/databooks/16?page=31",
    sourceLabelKey: "wiki.kiEncyclopedia.quotes.chozenshuLimitsSource",
  },
  {
    id: "mutaito-origin",
    ja: "[00:13:49] 気の力じゃ。気とは人間の根源的なエネルギー… [00:14:47] 大切なのは集中力じゃ。すべての集中力を拳に懸け、一気にエネルギーを解き放つ。一点の邪念もあってはならない。",
    translationKey: "wiki.kiEncyclopedia.quotes.mutaitoOriginText",
    sourceHref: "/wiki/episodes/129",
    sourceLabelKey: "wiki.kiEncyclopedia.quotes.mutaitoOriginSource",
  },
  {
    id: "vegeta-meditation",
    ja: "[00:29:47] あの圧倒的に強かったジレン、実は力そのものはオレたちとそれほど大きな差はない… 一瞬の攻撃をする時以外は体も精神もリラックスさせている… だからオレはまず頭の中でトレーニングしている。",
    translationKey: "wiki.kiEncyclopedia.quotes.vegetaMeditationText",
    sourceHref: "/wiki/movies/dragon-ball-super-super-hero",
    sourceLabelKey: "wiki.kiEncyclopedia.quotes.vegetaMeditationSource",
  },
];

const KI_COMPONENTS: readonly KiComponentSpec[] = [
  {
    id: "genki",
    badge: "GENKI",
    kanji: "元気",
    accentBorder: "border-sky-500/35 bg-sky-950/[0.12]",
    accentBadge: "border-sky-400/40 bg-sky-500/15 text-sky-300",
    titleKey: "wiki.kiEncyclopedia.components.genkiTitle",
    bodyKey: "wiki.kiEncyclopedia.components.genkiBody",
    links: [
      { href: "/wiki/techniques/genkidama", labelKey: "wiki.kiEncyclopedia.links.genkidama" },
      { href: "/wiki/manga/20515", labelKey: "wiki.kiEncyclopedia.links.chapter515" },
    ],
  },
  {
    id: "yuki",
    badge: "YUKI",
    kanji: "勇気",
    accentBorder: "border-amber-500/35 bg-amber-950/[0.12]",
    accentBadge: "border-amber-400/40 bg-amber-500/15 text-amber-300",
    titleKey: "wiki.kiEncyclopedia.components.yukiTitle",
    bodyKey: "wiki.kiEncyclopedia.components.yukiBody",
    links: [{ href: "/wiki/databooks/9?page=92", labelKey: "wiki.kiEncyclopedia.links.seg92" }],
  },
  {
    id: "shoki",
    badge: "SHOKI",
    kanji: "正気",
    accentBorder: "border-emerald-500/35 bg-emerald-950/[0.12]",
    accentBadge: "border-emerald-400/40 bg-emerald-500/15 text-emerald-300",
    titleKey: "wiki.kiEncyclopedia.components.shokiTitle",
    bodyKey: "wiki.kiEncyclopedia.components.shokiBody",
    links: [
      { href: "/wiki/databooks/6?page=74", labelKey: "wiki.kiEncyclopedia.links.segChar74" },
      { href: "/wiki/databooks/9?page=58", labelKey: "wiki.kiEncyclopedia.links.seg58" },
    ],
  },
  {
    id: "spirit",
    badge: "SPIRIT",
    kanji: "スピリット",
    accentBorder: "border-purple-500/35 bg-purple-950/[0.12]",
    accentBadge: "border-purple-400/40 bg-purple-500/15 text-purple-300",
    titleKey: "wiki.kiEncyclopedia.components.spiritTitle",
    bodyKey: "wiki.kiEncyclopedia.components.spiritBody",
    links: [
      { href: "/wiki/locations/planete-yardrat", labelKey: "wiki.kiEncyclopedia.links.yardrat" },
      {
        href: "/wiki/techniques/teleportation",
        labelKey: "wiki.kiEncyclopedia.links.teleportation",
      },
      { href: "/wiki/manga/1366", labelKey: "wiki.kiEncyclopedia.links.dbs52" },
    ],
  },
];

const KI_LAWS: readonly KiLawSpec[] = [
  {
    id: "amplification",
    titleKey: "wiki.kiEncyclopedia.laws.amplificationTitle",
    bodyKey: "wiki.kiEncyclopedia.laws.amplificationBody",
    sourceHref: "/wiki/databooks/6?page=74",
    sourceLabelKey: "wiki.kiEncyclopedia.laws.amplificationSource",
  },
  {
    id: "barrier",
    titleKey: "wiki.kiEncyclopedia.laws.barrierTitle",
    bodyKey: "wiki.kiEncyclopedia.laws.barrierBody",
    sourceHref: "/wiki/techniques/barriere-bouclier",
    sourceLabelKey: "wiki.kiEncyclopedia.laws.barrierSource",
  },
  {
    id: "blutz",
    titleKey: "wiki.kiEncyclopedia.laws.blutzTitle",
    bodyKey: "wiki.kiEncyclopedia.laws.blutzBody",
    sourceHref: "/wiki/techniques/power-ball",
    sourceLabelKey: "wiki.kiEncyclopedia.laws.blutzSource",
  },
  {
    id: "transcendence",
    titleKey: "wiki.kiEncyclopedia.laws.transcendenceTitle",
    bodyKey: "wiki.kiEncyclopedia.laws.transcendenceBody",
    sourceHref: "/wiki/episodes/423",
    sourceLabelKey: "wiki.kiEncyclopedia.laws.transcendenceSource",
  },
];

const KI_FORMS: readonly KiFormSpec[] = [
  {
    id: "mortal",
    kanji: "潜在気・気功",
    accentText: "text-amber-300",
    eraKey: "wiki.kiEncyclopedia.forms.mortalEra",
    titleKey: "wiki.kiEncyclopedia.forms.mortalTitle",
    bodyKey: "wiki.kiEncyclopedia.forms.mortalBody",
    sourceHref: "/wiki/episodes/360",
    sourceLabelKey: "wiki.kiEncyclopedia.forms.mortalSource",
  },
  {
    id: "cosmic-genki",
    kanji: "全宇宙の元気",
    accentText: "text-sky-300",
    eraKey: "wiki.kiEncyclopedia.forms.cosmicGenkiEra",
    titleKey: "wiki.kiEncyclopedia.forms.cosmicGenkiTitle",
    bodyKey: "wiki.kiEncyclopedia.forms.cosmicGenkiBody",
    sourceHref: "/wiki/episodes/173",
    sourceLabelKey: "wiki.kiEncyclopedia.forms.cosmicGenkiSource",
  },
  {
    id: "cyber-bio",
    kanji: "永久エネルギー・生体エキス",
    accentText: "text-emerald-300",
    eraKey: "wiki.kiEncyclopedia.forms.cyberBioEra",
    titleKey: "wiki.kiEncyclopedia.forms.cyberBioTitle",
    bodyKey: "wiki.kiEncyclopedia.forms.cyberBioBody",
    sourceHref: "/wiki/databooks/4?page=74",
    sourceLabelKey: "wiki.kiEncyclopedia.forms.cyberBioSource",
  },
  {
    id: "jaki-kili",
    kanji: "邪気・キリ",
    accentText: "text-rose-300",
    eraKey: "wiki.kiEncyclopedia.forms.jakiKiliEra",
    titleKey: "wiki.kiEncyclopedia.forms.jakiKiliTitle",
    bodyKey: "wiki.kiEncyclopedia.forms.jakiKiliBody",
    sourceHref: "/wiki/movies/fusion-reborn",
    sourceLabelKey: "wiki.kiEncyclopedia.forms.jakiKiliSource",
  },
  {
    id: "plus-minus",
    kanji: "プラス／マイナスエネルギー",
    accentText: "text-red-300",
    eraKey: "wiki.kiEncyclopedia.forms.plusMinusEra",
    titleKey: "wiki.kiEncyclopedia.forms.plusMinusTitle",
    bodyKey: "wiki.kiEncyclopedia.forms.plusMinusBody",
    sourceHref: "/wiki/episodes/605",
    sourceLabelKey: "wiki.kiEncyclopedia.forms.plusMinusSource",
  },
  {
    id: "magic",
    kanji: "魔力・白魔法／黒魔法",
    accentText: "text-fuchsia-300",
    eraKey: "wiki.kiEncyclopedia.forms.magicEra",
    titleKey: "wiki.kiEncyclopedia.forms.magicTitle",
    bodyKey: "wiki.kiEncyclopedia.forms.magicBody",
    sourceHref: "/wiki/episodes/545",
    sourceLabelKey: "wiki.kiEncyclopedia.forms.magicSource",
  },
  {
    id: "god-ki",
    kanji: "神の気",
    accentText: "text-cyan-300",
    eraKey: "wiki.kiEncyclopedia.forms.godKiEra",
    titleKey: "wiki.kiEncyclopedia.forms.godKiTitle",
    bodyKey: "wiki.kiEncyclopedia.forms.godKiBody",
    sourceHref: "/wiki/databooks/19?page=49",
    sourceLabelKey: "wiki.kiEncyclopedia.forms.godKiSource",
  },
  {
    id: "hakai-ui",
    kanji: "破壊・身勝手の極意",
    accentText: "text-purple-300",
    eraKey: "wiki.kiEncyclopedia.forms.hakaiUiEra",
    titleKey: "wiki.kiEncyclopedia.forms.hakaiUiTitle",
    bodyKey: "wiki.kiEncyclopedia.forms.hakaiUiBody",
    sourceHref: "/wiki/episodes/631",
    sourceLabelKey: "wiki.kiEncyclopedia.forms.hakaiUiSource",
  },
];

export function KiEncyclopediaSection() {
  return (
    <section id="encyclopedie-du-ki" className="space-y-8">
      {/* Bloc principal : Définition, Citations Verbatim & Triade Spirituelle */}
      <div className="dbz-panel space-y-6 border-t-4 border-t-dbz-orange p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-5">
          <div className="max-w-3xl space-y-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-dbz-orange/40 bg-dbz-orange/10 px-3 py-1 font-scouter text-[10px] uppercase tracking-[0.2em] text-dbz-orange">
              <T k="wiki.kiEncyclopedia.badge" />
            </span>
            <h2 className="font-saiyan text-3xl uppercase tracking-wider text-white sm:text-4xl">
              <T k="wiki.kiEncyclopedia.heading" />
            </h2>
            <p className="text-sm leading-relaxed text-white/75 sm:text-base">
              <T k="wiki.kiEncyclopedia.lead" />
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/wiki/databooks/9?page=92"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-dbz-orange/40 bg-dbz-orange/15 px-3.5 py-2 font-mono text-xs font-bold text-dbz-orange transition-colors hover:bg-dbz-orange hover:text-black"
            >
              <span>Super Exciting Guide (p. 92)</span>
              <span aria-hidden>-&gt;</span>
            </Link>
            <Link
              href="/wiki/databooks/19?page=49"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3.5 py-2 font-mono text-xs text-white/80 transition-colors hover:border-dbz-blue/50 hover:text-white"
            >
              <span>Chōzenshū 4 (p. 49)</span>
              <span aria-hidden>-&gt;</span>
            </Link>
          </div>
        </div>

        {/* Citations textuelles des databooks & transcriptions animées */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-dbz-orange">
              <T k="wiki.kiEncyclopedia.quotesHeading" />
            </h3>
            <div className="h-px flex-1 bg-gradient-to-r from-dbz-orange/35 to-transparent" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {KI_QUOTES.map((q) => (
              <blockquote
                key={q.id}
                className="flex flex-col justify-between space-y-3 rounded-xl border border-white/10 bg-black/45 p-4"
              >
                <div className="space-y-2">
                  <p lang="ja" className="font-jp text-xs leading-relaxed text-amber-200/90">
                    {q.ja}
                  </p>
                  <p className="text-xs italic leading-relaxed text-white/75">
                    <T k={q.translationKey} />
                  </p>
                </div>
                <Link
                  href={q.sourceHref}
                  className="inline-flex items-center gap-1 font-mono text-[11px] text-dbz-blue-light transition-colors hover:text-dbz-orange hover:underline"
                >
                  <span>
                    <T k={q.sourceLabelKey} />
                  </span>
                  <span aria-hidden>-&gt;</span>
                </Link>
              </blockquote>
            ))}
          </div>
        </div>

        {/* Composition spirituelle du Ki (Genki, Yuki, Shoki + Spirit) */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-2">
            <h3 className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-dbz-orange">
              <T k="wiki.kiEncyclopedia.componentsHeading" />
            </h3>
            <div className="h-px flex-1 bg-gradient-to-r from-dbz-orange/35 to-transparent" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {KI_COMPONENTS.map((comp) => (
              <div
                key={comp.id}
                className={`flex flex-col justify-between space-y-3 rounded-2xl border p-4 sm:p-5 ${comp.accentBorder}`}
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${comp.accentBadge}`}
                    >
                      {comp.badge}
                    </span>
                    <span lang="ja" className="font-jp text-sm font-bold text-white/80">
                      {comp.kanji}
                    </span>
                  </div>
                  <h4 className="text-base font-extrabold text-white">
                    <T k={comp.titleKey} />
                  </h4>
                  <p className="text-xs leading-relaxed text-white/75 sm:text-sm">
                    <T k={comp.bodyKey} />
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {comp.links.map((lnk) => (
                    <Link
                      key={lnk.href}
                      href={lnk.href}
                      className="inline-flex min-h-8 items-center gap-1 rounded-full border border-white/15 bg-black/50 px-3 py-1 font-mono text-[11px] text-white/85 transition-colors hover:border-dbz-orange hover:text-dbz-orange"
                    >
                      <span>
                        <T k={lnk.labelKey} />
                      </span>
                      <span aria-hidden>-&gt;</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Lois martiales & mécaniques du Ki */}
        <div className="space-y-3 border-t border-white/10 pt-5">
          <div className="flex items-center gap-2">
            <h3 className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-dbz-orange">
              <T k="wiki.kiEncyclopedia.lawsHeading" />
            </h3>
            <div className="h-px flex-1 bg-gradient-to-r from-dbz-orange/35 to-transparent" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {KI_LAWS.map((law) => (
              <div
                key={law.id}
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
                  <span>
                    <T k={law.sourceLabelKey} />
                  </span>
                  <span aria-hidden>-&gt;</span>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Typologie complète des énergies à travers Manga, Anime, Films, GT, Daima & Super */}
      <div className="dbz-panel space-y-5 p-6 sm:p-8">
        <div className="space-y-1 border-b border-white/10 pb-4">
          <p className="font-scouter text-[10px] uppercase tracking-[0.2em] text-dbz-orange">
            <T k="wiki.kiEncyclopedia.formsKicker" />
          </p>
          <h3 className="font-saiyan text-2xl uppercase tracking-wider text-white sm:text-3xl">
            <T k="wiki.kiEncyclopedia.formsHeading" />
          </h3>
          <p className="max-w-3xl text-xs leading-relaxed text-white/70 sm:text-sm">
            <T k="wiki.kiEncyclopedia.formsLead" />
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {KI_FORMS.map((form) => (
            <div
              key={form.id}
              className="flex flex-col justify-between space-y-3 rounded-xl border border-white/10 bg-white/[0.025] p-4 transition-colors hover:border-dbz-orange/40"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`font-mono text-[10px] font-bold uppercase tracking-wider ${form.accentText}`}
                  >
                    <T k={form.eraKey} />
                  </span>
                  <span lang="ja" className="font-jp text-[11px] text-white/45">
                    {form.kanji}
                  </span>
                </div>
                <h4 className="text-sm font-extrabold text-white">
                  <T k={form.titleKey} />
                </h4>
                <p className="text-xs leading-relaxed text-white/70">
                  <T k={form.bodyKey} />
                </p>
              </div>
              <Link
                href={form.sourceHref}
                className="inline-flex items-center gap-1 border-t border-white/10 pt-2.5 font-mono text-[11px] text-dbz-blue-light transition-colors hover:text-dbz-orange hover:underline"
              >
                <span>
                  <T k={form.sourceLabelKey} />
                </span>
                <span aria-hidden>-&gt;</span>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
