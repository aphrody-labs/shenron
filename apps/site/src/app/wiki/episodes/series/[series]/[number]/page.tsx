/* oxlint-disable react/iframe-missing-sandbox -- legacy UI kept as-is (behavior-preserving lint pass) */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { T } from "@/components/T";
import { PageShell } from "@/components/kit";
import { BackgroundImage } from "@/components/media/BackgroundImage";
import { getEpisodesCached } from "../../../_shared";
import { EpisodeSeriesGrid } from "../EpisodeSeriesGrid";
import { officialEpisodeCatalogue } from "@/lib/official-episode-catalogue";
import { VideoPlayer } from "@/components/episodes/VideoPlayer";
import { VideoSourceSummary } from "@/components/episodes/VideoSourceSummary";
import { assetUrl } from "@/lib/assets";
import { EpisodeScenes } from "../../../[id]/EpisodeScenes";
import { ShareButton } from "@/components/ShareButton";
import { ogMeta } from "@/lib/og";
import { getDictionary } from "@/lib/i18n";
import { DBS_BEERUS_EPISODE_HREF, DBS_BEERUS_SERIES_CODE } from "@/lib/episode-series-catalogue";

export const revalidate = 3600;
const artwork = "/banners/dbs-beerus-2026.jpg";

export function generateStaticParams() {
  return [{ series: DBS_BEERUS_SERIES_CODE, number: "1" }];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ series: string; number: string }>;
}): Promise<Metadata> {
  const { series, number } = await params;
  if (series !== DBS_BEERUS_SERIES_CODE || number !== "1") notFound();
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
      image: artwork,
    }),
  };
}

export default async function OfficialBeerusEpisodePage({
  params,
}: {
  params: Promise<{ series: string; number: string }>;
}) {
  const { series, number } = await params;
  if (series !== DBS_BEERUS_SERIES_CODE || number !== "1") notFound();
  const text = getDictionary().dbsBeerus;
  const catalogue = await getEpisodesCached(series, 1000, 0);
  const episode = catalogue.episodes.find((entry) => entry.number_in_series === Number(number));
  if (!episode?.video_url) notFound();
  const playable = catalogue.episodes
    .filter((entry) => entry.video_url && entry.number_in_series !== null)
    .toSorted((a, b) => (a.number_in_series ?? 0) - (b.number_in_series ?? 0));
  const currentIndex = playable.findIndex((entry) => entry.id === episode.id);
  const previous = playable[currentIndex - 1];
  const next = playable[currentIndex + 1];
  const cards = officialEpisodeCatalogue(series, catalogue.episodes, {
    title: text.episodeTitle,
    synopsis: text.episodeSynopsis,
  });
  return (
    <main className="relative isolate min-w-0">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "TVEpisode",
          episodeNumber: "1",
          name: text.episodeTitle,
          description: text.episodeSynopsis,
          datePublished: "2026-10-11",
          partOfSeries: { "@type": "TVSeries", name: text.title },
        }}
      />
      <div className="absolute inset-x-0 top-0 -z-10 h-[36rem] overflow-hidden" aria-hidden>
        <BackgroundImage src={artwork} priority className="absolute inset-0 opacity-35" />
        <div className="absolute inset-0 bg-gradient-to-t from-dbz-bg via-dbz-bg/50 to-transparent" />
      </div>
      <PageShell as="article" rhythm="tight" className="relative">
        <Breadcrumbs
          className="mb-4"
          items={[
            { label: getDictionary().episodeSeries.episodes, href: "/wiki/episodes" },
            { label: text.title, href: "/wiki/episodes/series/DBS_BEERUS" },
            { label: text.episodeOne },
          ]}
        />
        <div className="mb-10">
          <ShareButton
            title={text.episodeTitle}
            text={text.episodeSynopsis}
            path={DBS_BEERUS_EPISODE_HREF}
          />
        </div>
        <header className="mb-8">
          <div className="mb-4 flex flex-wrap items-center gap-4">
            <span className="scouter-text text-2xl text-dbz-orange">#001</span>
            <div className="h-px w-12 bg-dbz-orange/40" />
            <p className="font-display text-xs font-semibold uppercase tracking-widest text-white/60">
              <T k="dbsBeerus.title" />
            </p>
          </div>
          <h1 className="mb-4 max-w-3xl font-display text-4xl font-bold leading-tight text-white lg:text-6xl">
            <T k="dbsBeerus.episodeTitle" />
          </h1>
          <p className="text-sm text-white/60">
            <T k="dbsBeerus.episodeReleaseDate" />
          </p>
        </header>
        <div id="player" className="mb-8 space-y-4">
          <VideoPlayer
            src={episode.video_url}
            title={episode.title}
            poster={episode.image ? assetUrl(episode.image) : undefined}
            subtitles={episode.subtitles ?? undefined}
            previousEpisode={
              previous
                ? { href: `/wiki/episodes/${previous.id}`, label: previous.title }
                : undefined
            }
            nextEpisode={
              next ? { href: `/wiki/episodes/${next.id}`, label: next.title } : undefined
            }
          />
          <VideoSourceSummary
            players={[{ name: episode.title, provider: "mugiwara", embedUrl: episode.video_url }]}
            offers={episode.availability}
            subtitles={episode.subtitles?.length ?? 0}
            frames={episode.frames?.length ?? 0}
          />
        </div>
        <div className="space-y-12">
          <section aria-labelledby="series-catalogue-title" className="space-y-5">
            <h2 id="series-catalogue-title" className="font-display text-2xl font-bold text-white">
              <T k="episodeSeries.episodes" />
            </h2>
            <EpisodeSeriesGrid episodes={cards} />
          </section>
          <section className="dbz-panel relative overflow-hidden p-6 sm:p-8">
            <div className="absolute inset-y-0 left-0 w-1 bg-dbz-orange" />
            <h2 className="mb-4 font-display text-xl font-bold text-dbz-orange">
              <T k="dbsBeerus.episodeTitle" />
            </h2>
            <p className="leading-relaxed text-white/75">
              <T k="dbsBeerus.episodeSynopsis" />
            </p>
          </section>
          <section className="space-y-4">
            <h2 className="font-display text-2xl font-bold text-white">
              <T k="dbsBeerus.trailer" />
            </h2>
            <div className="aspect-video overflow-hidden rounded-xl bg-black">
              <iframe
                src="https://www.youtube-nocookie.com/embed/CFgEL7ei8VE"
                title={text.trailer}
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full border-0"
              />
            </div>
          </section>
          <EpisodeScenes
            frames={episode.frames ?? []}
            title={text.episodeTitle}
            episodeNumber={1}
          />
          <aside className="dbz-panel space-y-4 p-6">
            <h2 className="font-display text-xl font-bold text-white">
              <T k="dbsBeerus.details" />
            </h2>
            <p className="text-sm leading-relaxed text-white/75">
              <T k="dbsBeerus.episodeOneDetails" />
            </p>
            <p className="text-sm leading-relaxed text-white/65">
              <T k="dbsBeerus.episodeContinuity" />
            </p>
            <Link
              href="/wiki/episodes/series/DBS_BEERUS"
              className="inline-flex min-h-11 items-center text-dbz-orange"
            >
              <T k="episodeSeries.episodes" />
            </Link>
          </aside>
          <footer className="border-t border-white/10 pt-6 text-xs text-white/50">
            <a
              href="https://dragonball-super.com/en/index.html#story"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              <T k="dbsBeerus.episodeSource" />
            </a>
          </footer>
        </div>
      </PageShell>
    </main>
  );
}
