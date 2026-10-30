import Link from "next/link";
import { T } from "@/components/T";
import { DBS_BEERUS_SERIES_CODE } from "@/lib/episode-series-catalogue";
import styles from "./HomeHero.module.css";
import { ArrowRight, Play } from "lucide-react";
import { CadreCase } from "@aphrody/shenron-ui/toriyama";
import { HOME_HERO_FRAMES } from "@/lib/home-hero-frames";
import { HomeBeerusLogo } from "./HomeBeerusLogo";
export interface BeerusEpisodeSummary {
  id: number;
  number: number | null;
  title: string;
  titleJa?: string | null;
  airDate?: number | null;
  duration?: number | null;
  image?: string;
}
export interface BeerusFeature {
  total: number;
  latest: BeerusEpisodeSummary | null;
  episodes?: BeerusEpisodeSummary[];
}
/** Episodes shown in the hero rail: the most recent aired ones, oldest first. */
const RAIL_EPISODES = 3;

export function HomeBeerusFeature({ beerus }: { beerus: BeerusFeature }) {
  const aired = beerus.episodes ?? [];
  const latest = aired.at(-1) ?? beerus.latest ?? undefined;
  const episodes = aired.slice(-RAIL_EPISODES);
  return (
    <div className={styles.feature}>
      <div className={styles.featureMain}>
        <p className={styles.eyebrow}>
          <T k="accueil.hero.featureEyebrow" />
        </p>
        <h2 className="sr-only">
          <T k="dbsBeerus.title" />
        </h2>
        <HomeBeerusLogo />
        {latest && <p className={styles.episodeTitle}>{latest.title}</p>}
        <div className={styles.actions}>
          {latest && (
            <Link href={`/wiki/episodes/${latest.id}`} className={styles.primary}>
              <Play size={19} fill="currentColor" aria-hidden="true" />
              <T k="accueil.hero.watchEpisode" values={{ number: latest.number ?? "" }} />
            </Link>
          )}
          <Link
            href={`/wiki/episodes/series/${DBS_BEERUS_SERIES_CODE}`}
            className={styles.secondary}
          >
            <ArrowRight size={19} aria-hidden="true" />
            <T k="dbsBeerus.heroAll" />
          </Link>
        </div>
      </div>
      {episodes.length > 0 && (
        <div className={styles.episodeRail}>
          {episodes.map((ep) => {
            const thumbnail =
              HOME_HERO_FRAMES.find((item) => item.episodeId === ep.id)?.src ??
              (ep.image && !ep.image.startsWith("/banners/") ? ep.image : null);
            return (
              <Link key={ep.id} href={`/wiki/episodes/${ep.id}`} className={styles.episode}>
                {thumbnail && (
                  <CadreCase largeur={80} className={styles.thumbnail}>
                    <img src={thumbnail} alt="" width={80} height={45} loading="lazy" />
                  </CadreCase>
                )}
                <span className={styles.episodeCopy}>
                  <span className={styles.episodeNumber}>
                    <T k="accueil.hero.episodeNumber" values={{ number: ep.number ?? "" }} />
                  </span>
                  <span>{ep.title}</span>
                </span>
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
