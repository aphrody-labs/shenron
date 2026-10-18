import Link from "next/link";
import { T } from "@/components/T";
import { DBS_BEERUS_SERIES_CODE } from "@/lib/episode-series-catalogue";
import styles from "./HomeHero.module.css";
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
export function HomeBeerusFeature({ beerus }: { beerus: BeerusFeature }) {
  const episodes = (beerus.episodes ?? []).filter((ep) => ep.id === 875 || ep.id === 876);
  const latest = episodes.at(-1);
  return (
    <div className={styles.feature}>
      <p className={styles.eyebrow}>
        <T k="accueil.hero.featureEyebrow" />
      </p>
      <h2 className={styles.title}>
        <T k="dbsBeerus.title" />
      </h2>
      {latest && <p className={styles.episodeTitle}>{latest.title}</p>}
      <div className={styles.actions}>
        {latest && (
          <Link href={`/wiki/episodes/${latest.id}`} className={styles.primary}>
            <span aria-hidden="true">▶</span>
            <T k="accueil.hero.watchEpisode" values={{ number: latest.number ?? "" }} />
          </Link>
        )}
        <Link href={`/wiki/episodes/series/${DBS_BEERUS_SERIES_CODE}`} className={styles.secondary}>
          <T k="dbsBeerus.heroAll" />
          <span aria-hidden="true">→</span>
        </Link>
      </div>
      {episodes.length > 0 && (
        <div className={styles.episodeRail}>
          {episodes.map((ep) => (
            <Link key={ep.id} href={`/wiki/episodes/${ep.id}`} className={styles.episode}>
              <span className={styles.episodeNumber}>
                <T k="accueil.hero.episodeNumber" values={{ number: ep.number ?? "" }} />
              </span>
              <span>{ep.title}</span>
              <span aria-hidden="true">↗</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
