// Keep the index loader scoped to the catalogue, not streamed detail routes.
import { SectionUnavailable } from "@/components/wiki/SectionUnavailable";
import { dbUniverse } from "@/lib/db-universe";
import { T } from "@/components/T";
import { SagaCatalogue } from "@/components/wiki/SagaCatalogue";
import { wikiAccess } from "@/components/wiki/wiki-access";
import type { Metadata } from "next";
import { WikiIndexPage } from "@/components/wiki/WikiIndexPage";
import { pageHero } from "@/lib/banner-config";
import { markdownToPlainText } from "@/lib/markdown-plain";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Sagas & arcs Dragon Ball",
  description:
    "Toutes les sagas et arcs narratifs Dragon Ball, Dragon Ball Z, Super, GT et Daima — résumés en français.",
  alternates: { canonical: "/wiki/sagas" },
};

const SERIES_LABELS: Record<string, string> = {
  DB: "Dragon Ball",
  DBZ: "Dragon Ball Z",
  DBGT: "Dragon Ball GT",
  DBS: "Dragon Ball Super (anime)",
  DBS_MANGA: "Dragon Ball Super (manga)",
  DBS_MOVIE: "Films Dragon Ball Super",
  DB_DAIMA: "Dragon Ball Daima",
};

const SERIES_ORDER = ["DB", "DBZ", "DBGT", "DBS", "DBS_MANGA", "DBS_MOVIE", "DB_DAIMA"];

type ArcLite = {
  id: number;
  slug: string;
  name: string;
  name_ja: string | null;
  order_idx: number;
  saga_slug: string | null;
};

export default async function SagasPage() {
  const [data, arcsData, access] = await Promise.all([
    dbUniverse.sagas(),
    dbUniverse.arcs(),
    wikiAccess(),
  ]);
  if (!data || data.sagas.length === 0)
    return <SectionUnavailable title={<T k="wiki.sagas.title" />} />;
  const sagas = data.sagas;
  const arcs = (arcsData?.arcs ?? []) as ArcLite[];

  const arcsBySaga = new Map<string, ArcLite[]>();
  for (const a of arcs) {
    if (!a.saga_slug) continue;
    const list = arcsBySaga.get(a.saga_slug) ?? [];
    list.push(a);
    arcsBySaga.set(a.saga_slug, list);
  }

  const bySeries = SERIES_ORDER.map((s) => ({
    key: s,
    label: SERIES_LABELS[s] ?? s,
    sagas: sagas.filter((sg) => sg.series === s).toSorted((a, b) => a.order_idx - b.order_idx),
  })).filter((g) => g.sagas.length > 0);

  const totalArcs = arcs.length;

  return (
    <WikiIndexPage
      eyebrow={<T k="wiki.sagas.eyebrow" />}
      title={<T k="wiki.sagas.title" />}
      lead={<T k="wiki.sagas.lead" values={{ sagas: sagas.length, arcs: totalArcs }} />}
      image={await pageHero("sagas")}
      imageAlt="Bannière officielle Dragon Ball"
      crumbs={[{ label: "Sagas & arcs", display: <T k="wiki.sagas.title" /> }]}
      category="sagas"
      contributeKey="kit.contribute.what.saga"
    >
      <SagaCatalogue
        access={access}
        groups={bySeries.map((group) => ({
          key: group.key,
          label: group.label,
          sagas: group.sagas.map((saga) => ({
            id: saga.id,
            slug: saga.slug,
            name: saga.name,
            nameJa: saga.name_ja,
            order: saga.order_idx,
            image: saga.image,
            description: markdownToPlainText(saga.description ?? ""),
            arcs: (arcsBySaga.get(saga.slug) ?? []).toSorted((a, b) => a.order_idx - b.order_idx),
          })),
        }))}
      />
    </WikiIndexPage>
  );
}
