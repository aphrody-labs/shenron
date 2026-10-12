import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { T } from "@/components/T";
import { BackgroundImage } from "@/components/media/BackgroundImage";
import { VideoSourceSummary } from "@/components/episodes/VideoSourceSummary";
import { VideoUnavailableCard } from "@/components/episodes/VideoUnavailableCard";
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
      <article className="relative mx-auto w-full max-w-[1180px] px-6 pb-20 pt-10 lg:px-10">
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
          <VideoUnavailableCard title={text.episodeTitle} kind="episode" />
          <VideoSourceSummary players={[]} />
        </div>
        <div className="space-y-12">
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
            frames={[]}
            title={text.episodeTitle}
            episodeNumber={1}
            series={DBS_BEERUS_SERIES_CODE}
            episodeImage={artwork}
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
      </article>
    </main>
  );
}
