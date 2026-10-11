import type { Metadata } from "next";
import Link from "next/link";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PageShell } from "@aphrody/shenron-ui/layout/PageShell";
import { SectionHeading } from "@aphrody/shenron-ui/layout/SectionHeading";
import { ExternalLink } from "@aphrody/shenron-ui/external";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { LinkPager } from "@/components/kit";
import { T } from "@/components/T";
import { SITE_URL } from "@/lib/config";
import {
  EXTERNAL_SOURCE_KINDS,
  externalSourceHref,
  searchExternalSources,
} from "@/lib/external-source-catalog";
import { ogMeta } from "@/lib/og";

// La provenance est alimentée par les campagnes BXC en cours : cinq minutes
// gardent le coût des lectures PG borné tout en évitant une page figée pendant
// une longue collecte.
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Sources Dragon Ball — collecte BXC et Shenron",
  description:
    "Moteur de recherche Dragon Ball attribué : pages web, publications, épisodes, statistiques, archives et médias.",
  ...ogMeta({
    title: "Sources Dragon Ball — BXC × Shenron",
    description:
      "Moteur de recherche attribué couvrant les sources Dragon Ball collectées par BXC.",
    canonical: "/sources/dragon-ball",
    type: "website",
  }),
};

type JsonValue = { [key: string]: unknown } | unknown[];

async function readDataset<T extends JsonValue>(name: string): Promise<T | null> {
  const candidates = [
    join(process.cwd(), "data", "crawled_db", name),
    join(process.cwd(), "..", "..", "data", "crawled_db", name),
  ];
  for (const path of candidates) {
    if (!existsSync(/* turbopackIgnore: true */ path)) continue;
    try {
      return JSON.parse(await readFile(/* turbopackIgnore: true */ path, "utf8")) as T;
    } catch {
      return null;
    }
  }
  return null;
}

function countRows(value: JsonValue | null): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") {
    const docs = value.docs;
    if (Array.isArray(docs)) return docs.length;
  }
  return 0;
}

function firstTitle(value: JsonValue | null): string | null {
  if (!Array.isArray(value) || !value.length || typeof value[0] !== "object" || !value[0])
    return null;
  const item = value[0] as Record<string, unknown>;
  for (const key of ["title", "title_fr", "name", "originalTitle"]) {
    if (typeof item[key] === "string" && item[key]) return item[key] as string;
  }
  return null;
}

function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source externe";
  }
}

function formatFetchedAt(value: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(value);
}

function provenanceLabel(provenance: Record<string, unknown>): string | null {
  const crawlSource = provenance.crawlSource;
  if (typeof crawlSource !== "string" || !crawlSource) return null;
  return crawlSource.split("/").filter(Boolean).at(-2) ?? null;
}

const KIND_LABEL: Record<string, string> = {
  publisher: "Éditeur",
  reference: "Référence",
  archive: "Archive",
  wayback: "Archive web",
  encyclopedia: "Encyclopédie",
  statistics: "Statistiques",
  media: "Média",
};

function safeExternalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

const SOURCES = [
  {
    key: "web-a",
    label: "Collecte Web A",
    kind: "Actualités et publications",
    url: "https://dragon-ball-official.com/",
    href: "/news",
    file: "db_official_news.json",
    accent: "border-dbz-orange/40 bg-dbz-orange/10",
  },
  {
    key: "toei",
    label: "Toei Animation",
    kind: "Épisodes et synopsis",
    url: "https://lineup.toei-anim.co.jp/ja/search/list.php?type=search&val=ドラゴンボール",
    href: "/wiki/episodes",
    file: "toei_episodes_classic.json",
    accent: "border-blue-400/40 bg-blue-400/10",
  },
  {
    key: "jajanken",
    label: "Jajanken / Weekly Shōnen Jump",
    kind: "Classements et statistiques manga",
    url: "https://www.jajanken.net/sakuhins/QvL0By28NV",
    href: "/wiki/manga",
    file: "jajanken_jump_stats.json",
    accent: "border-dbz-gold/40 bg-dbz-gold/10",
  },
  {
    key: "toriyama",
    label: "Canon — Akira Toriyama",
    kind: "Biographies et repères historiques",
    url: "https://ja.wikipedia.org/wiki/鳥山明",
    href: "/wiki/toriyama",
    file: "toriyama_archives.json",
    accent: "border-emerald-400/40 bg-emerald-400/10",
  },
] as const;

export default async function DragonBallSourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string; page?: string }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 120);
  const kind = EXTERNAL_SOURCE_KINDS.includes(params.kind as (typeof EXTERNAL_SOURCE_KINDS)[number])
    ? params.kind!
    : "";
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = 18;
  const [datasets, bxcCatalog] = await Promise.all([
    Promise.all(SOURCES.map(async (source) => ({ source, data: await readDataset(source.file) }))),
    searchExternalSources({ q, kind, limit: pageSize, offset: (page - 1) * pageSize }),
  ]);
  const toeiFiles = [
    "toei_episodes_classic.json",
    "toei_episodes_dbz.json",
    "toei_episodes_dbs.json",
    "toei_episodes_kai.json",
  ];
  const toeiCount = (await Promise.all(toeiFiles.map((file) => readDataset(file)))).reduce(
    (sum, data) => sum + countRows(data),
    0,
  );
  const feed = await readDataset("shenron_feed_actu.json");
  const pageCount = Math.max(1, Math.ceil(bxcCatalog.total / pageSize));
  // URL d’une page de résultats, filtres conservés (page 1 = URL sans `page`).
  const pageHref = (p: number) => {
    const qs = new URLSearchParams({
      ...(q ? { q } : {}),
      ...(kind ? { kind } : {}),
      ...(p > 1 ? { page: String(p) } : {}),
    }).toString();
    return qs ? `/sources/dragon-ball?${qs}` : "/sources/dragon-ball";
  };
  const totalRows =
    datasets.reduce((sum, item) => sum + countRows(item.data), 0) +
    toeiCount -
    countRows(datasets[1]?.data ?? null);

  const ld = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Sources Dragon Ball — BXC × Shenron",
    url: `${SITE_URL}/sources/dragon-ball`,
    isPartOf: { "@type": "WebSite", name: "Dragon Ball FR" },
    about: SOURCES.map((source) => ({
      "@type": "CreativeWork",
      name: source.label,
      url: source.url,
    })),
  };

  return (
    <PageShell rhythm="tight">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <Breadcrumbs
        className="mb-6"
        items={[{ label: "Sources Dragon Ball", display: "Sources BXC × Shenron" }]}
      />

      <SectionHeading
        level={1}
        kicker="Collecte attribuée · BXC"
        title="Les sources qui nourrissent Shenron"
        standfirst="Toutes les sources BXC sont indexées et classifiées ici : publications, références, archives, encyclopédies, statistiques et médias. Les textes restent attribués à leur origine ; le canon est un jugement séparé, jamais un filtre de recherche."
      />
      <ul className="mt-5 flex flex-wrap gap-2 text-xs text-white/55" aria-label="Volume collecté">
        <li className="rounded-full border border-white/10 px-3 py-1">
          {totalRows.toLocaleString("fr-FR")} entrées collectées
        </li>
        <li className="rounded-full border border-white/10 px-3 py-1">
          BXC · profil HTTP / statique
        </li>
        {bxcCatalog.total > 0 && (
          <li className="rounded-full border border-dbz-orange/30 bg-dbz-orange/10 px-3 py-1 text-dbz-orange">
            {bxcCatalog.total.toLocaleString("fr-FR")} documents synchronisés
          </li>
        )}
        {Array.isArray(feed) && (
          <li className="rounded-full border border-white/10 px-3 py-1">
            {feed.length} actus prêtes à publier
          </li>
        )}
      </ul>

      {/* Mobile : les sources premières, puis le moteur. Desktop large : les
          sources en colonne de gauche, le moteur et ses résultats à droite —
          la largeur sert à garder les deux sous les yeux. */}
      <div className="mt-10 grid gap-10 xl:grid-cols-[20rem_minmax(0,1fr)] xl:items-start">
        <section aria-labelledby="sources-premieres" className="min-w-0">
          <h2
            id="sources-premieres"
            className="mb-4 font-display text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-white/50"
          >
            Sources premières
          </h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            {datasets.map(({ source, data }) => {
              const count = source.key === "toei" ? toeiCount : countRows(data);
              return (
                <article key={source.key} className={`rounded-xl border p-5 ${source.accent}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">
                        {source.kind}
                      </p>
                      <h3 className="mt-2 text-lg font-bold text-white">{source.label}</h3>
                    </div>
                    <span className="shrink-0 rounded-full bg-black/25 px-3 py-1 text-sm font-semibold tabular-nums text-white">
                      {count.toLocaleString("fr-FR")}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-white/65">
                    {firstTitle(data) ?? "Données collectées et vérifiées par le pipeline BXC."}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    <Link
                      href={source.href}
                      className="inline-flex min-h-11 items-center rounded-lg bg-white/10 px-3 font-semibold text-white hover:bg-white/20"
                    >
                      Ouvrir la page Shenron
                    </Link>
                    <ExternalLink
                      href={source.url}
                      newTabHint={<T k="communaute.sources.newTab" />}
                      className="inline-flex min-h-11 items-center rounded-lg border border-white/15 px-3 text-white/70 hover:text-white"
                    >
                      Source première ↗
                    </ExternalLink>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="bxc-live-title" className="min-w-0">
          <SectionHeading
            id="bxc-live-title"
            kicker="Moteur BXC"
            title="Rechercher dans toutes les collectes"
            standfirst="Chaque résultat garde sa classification et son lien d’origine. Aucune source n’est écartée du moteur."
          />
          <form
            method="GET"
            className="mt-5 grid gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-[1fr_12rem] lg:grid-cols-[1fr_12rem_auto]"
          >
            <label className="sr-only" htmlFor="bxc-query">
              Rechercher dans les sources BXC
            </label>
            <input
              id="bxc-query"
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Goku, Daima, Toriyama, tournoi…"
              className="min-h-11 w-full rounded-lg border border-white/15 bg-black/20 px-3 text-base text-white outline-none placeholder:text-white/35 focus:border-dbz-orange sm:text-sm"
            />
            <select
              name="kind"
              defaultValue={kind}
              aria-label="Classification de source"
              className="min-h-11 rounded-lg border border-white/15 bg-black/20 px-3 text-base text-white outline-none focus:border-dbz-orange sm:text-sm"
            >
              <option value="">Toutes les classifications</option>
              {EXTERNAL_SOURCE_KINDS.map((value) => (
                <option key={value} value={value}>
                  {KIND_LABEL[value] ?? value}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="min-h-11 rounded-lg bg-dbz-orange px-5 text-sm font-bold text-black transition hover:bg-dbz-yellow sm:col-span-2 lg:col-span-1"
            >
              Rechercher
            </button>
          </form>
          {bxcCatalog.records.length > 0 ? (
            <ul className="mt-5 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {bxcCatalog.records.map((record) => {
                const original = safeExternalUrl(record.url);
                const collecte = provenanceLabel(record.provenance);
                return (
                  <li
                    key={record.url}
                    className="flex flex-col rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-dbz-orange/45"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-dbz-orange">
                      {sourceHost(record.url)} · {KIND_LABEL[record.kind] ?? record.kind}
                    </p>
                    <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-white">
                      <Link href={externalSourceHref(record.url)} className="hover:text-dbz-orange">
                        {record.title}
                      </Link>
                    </h3>
                    {record.excerpt ? (
                      <p className="mt-2 line-clamp-3 text-xs leading-5 text-white/55">
                        {record.excerpt}
                      </p>
                    ) : null}
                    {collecte ? (
                      <p className="mt-2 truncate text-[11px] text-white/40">
                        Collecte : {collecte}
                      </p>
                    ) : null}
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 pt-3 text-xs text-white/45">
                      <span>Relevée le {formatFetchedAt(record.fetchedAt)}</span>
                      <span className="flex shrink-0 gap-1">
                        <Link
                          href={externalSourceHref(record.url)}
                          className="inline-flex min-h-11 items-center px-2 font-semibold text-white/70 hover:text-dbz-orange"
                        >
                          Fiche
                        </Link>
                        {original ? (
                          <ExternalLink
                            href={original}
                            newTabHint={<T k="communaute.sources.newTab" />}
                            className="inline-flex min-h-11 items-center px-2 font-semibold text-white/70 hover:text-dbz-orange"
                          >
                            Original ↗
                          </ExternalLink>
                        ) : null}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-5 text-sm leading-6 text-white/60">
              {q || kind
                ? "Aucune source ne correspond à ces filtres."
                : "La synchronisation BXC est en cours. Les données apparaîtront ici dès leur ingestion."}
            </p>
          )}
          {bxcCatalog.total > pageSize && (
            <>
              <p className="mt-5 text-sm text-white/55">
                {bxcCatalog.total.toLocaleString("fr-FR")} résultats
              </p>
              <LinkPager
                className="mt-3"
                page={page}
                pages={pageCount}
                href={pageHref}
                ariaLabel="Pagination des sources BXC"
              />
            </>
          )}
        </section>
      </div>

      <section className="mt-10 rounded-xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/65">
        <h2 className="font-semibold text-white">Méthode et provenance</h2>
        <p className="mt-2 max-w-[70ch] leading-6">
          Chaque document est relié à son URL d’origine et à sa collecte. Les synopsis,
          statistiques, archives et pages externes restent des documents attribués ; le canon est
          une information éditoriale séparée, sans effet sur leur présence dans le moteur.
        </p>
      </section>
    </PageShell>
  );
}
