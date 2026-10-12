import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { T } from "@/components/T";
import { Billboard } from "@/components/stream/Billboard";
import { ogMeta } from "@/lib/og";
import { getDictionary } from "@/lib/i18n";
import { bannerForSeries } from "@/lib/banner-config";
import { DBS_BEERUS_EPISODE_HREF, DBS_BEERUS_SERIES_CODE } from "@/lib/episode-series-catalogue";

export const revalidate = 3600;

export function generateStaticParams() {
  return [{ series: DBS_BEERUS_SERIES_CODE, number: "131" }];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ series: string; number: string }>;
}): Promise<Metadata> {
  const { series, number } = await params;
  if (series !== DBS_BEERUS_SERIES_CODE || number !== "131") notFound();
  const text = getDictionary().dbsBeerus;
  const title = `${text.episodeTitle} — ${text.title}`;
  return {
    title,
    description: text.episodeSynopsis,
    ...ogMeta({
      title,
      description: text.episodeSynopsis,
      type: "video.episode",
      canonical: DBS_BEERUS_EPISODE_HREF,
    }),
  };
}

export default async function OfficialBeerusEpisodePage({
  params,
}: {
  params: Promise<{ series: string; number: string }>;
}) {
  const { series, number } = await params;
  if (series !== DBS_BEERUS_SERIES_CODE || number !== "131") notFound();

  const text = getDictionary().dbsBeerus;
  const schema = {
    "@context": "https://schema.org",
    "@type": "TVEpisode",
    episodeNumber: "131",
    name: text.episodeTitle,
    description: text.episodeSynopsis,
    datePublished: "2018-03-25",
    partOfSeries: { "@type": "TVSeries", name: text.title },
  } as const;

  return (
    <main>
      <JsonLd data={schema} />
      <Billboard
        backdrop={await bannerForSeries(DBS_BEERUS_SERIES_CODE)}
        eyebrow={
          <>
            <T k="dbsBeerus.edition" /> · 131
          </>
        }
        title={<T k="dbsBeerus.episodeTitle" />}
        meta={[<T key="release" k="dbsBeerus.episodeReleaseDate" />]}
        synopsis={<T k="dbsBeerus.episodeSynopsis" />}
        primaryHref="https://www.crunchyroll.com/fr/watch/GE00389313JAJP/the-god-who-destroys"
        primaryLabel={<T k="dbsBeerus.watchEpisode" />}
        secondaryHref="/wiki/episodes/series/DBS_BEERUS"
        secondaryLabel={<T k="episodeSeries.episodes" />}
      />
      <article className="wiki-container">
        <Breadcrumbs
          className="mb-8"
          items={[
            {
              label: getDictionary().episodeSeries.episodes,
              display: <T k="episodeSeries.episodes" />,
              href: "/wiki/episodes",
            },
            {
              label: text.title,
              display: <T k="dbsBeerus.title" />,
              href: "/wiki/episodes/series/DBS_BEERUS",
            },
            {
              label: `${text.episodeTitle} · 131`,
              display: (
                <>
                  <T k="dbsBeerus.episodeTitle" /> · 131
                </>
              ),
            },
          ]}
        />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
          <section className="dbz-panel p-6 sm:p-8">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-dbz-orange">
              <T k="dbsBeerus.episodeSource" />
            </p>
            <h2 className="mb-4 font-display text-2xl font-bold text-white sm:text-3xl">
              <T k="dbsBeerus.episodeTitle" />
            </h2>
            <p className="leading-relaxed text-white/75">
              <T k="dbsBeerus.episodeSynopsis" />
            </p>
            <a
              className="mt-6 inline-flex min-h-11 items-center rounded-lg border border-dbz-orange/40 px-4 text-sm font-semibold text-dbz-orange transition hover:bg-dbz-orange hover:text-black"
              href="https://dragonball-super.com/en/index.html#story"
              target="_blank"
              rel="noopener noreferrer"
            >
              <T k="dbsBeerus.episodeSource" />
            </a>
          </section>
          <aside className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-sm leading-relaxed text-white/65">
              <T k="dbsBeerus.episodeContinuity" />
            </p>
            <a
              className="dbz-button min-h-11 text-center !text-xs"
              href="https://www.crunchyroll.com/fr/watch/GE00389313JAJP/the-god-who-destroys"
              target="_blank"
              rel="noopener noreferrer"
            >
              <T k="dbsBeerus.watchEpisode" />
            </a>
            <p className="text-xs leading-relaxed text-white/50">
              <T k="dbsBeerus.episodeProviderNote" />
            </p>
            <a
              className="text-sm font-semibold text-dbz-orange underline underline-offset-4"
              href="/wiki/episodes/series/DBS"
            >
              <T k="dbsBeerus.originalCatalogue" />
            </a>
          </aside>
        </div>
      </article>
    </main>
  );
}
