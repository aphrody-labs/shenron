import { T } from "@/components/T";
import type { HomeConfig } from "@aphrody/shenron-config/home";
import { canonicalFrameUrl } from "@/lib/episode-frame-banner";
import { KintoUnVolant } from "./KintoUnVolant";
import type { BeerusFeature } from "./HomeBeerusFeature";
import { HomeBeerusCarousel } from "./HomeBeerusCarousel";
import { buildBeerusSlides } from "./beerus-slides";
import { HomeHeroFrames } from "./HomeHeroFrames";
import styles from "./HomeHero.module.css";
import Link from "next/link";

const EMPTY_FRAMES: readonly string[] = [];

export function HomeHero({
  hero,
  heroFrame,
  frames = EMPTY_FRAMES,
  beerus,
  className = "",
}: {
  hero: HomeConfig["hero"];
  heroFrame?: string;
  frames?: readonly string[];
  beerus?: BeerusFeature | null;
  className?: string;
}) {
  const fallback = canonicalFrameUrl(heroFrame ?? null);
  const qualified = frames.length ? frames.slice(0, 4) : fallback ? [fallback] : [];
  const episodes = beerus?.episodes?.length
    ? beerus.episodes
    : beerus?.latest
      ? [beerus.latest]
      : [];
  const slides = buildBeerusSlides(episodes);
  const carousel = slides.length > 0;
  return (
    <header
      id="hero"
      className={`${styles.hero} ${carousel ? styles.hasCarousel : ""} ${className}`}
    >
      {carousel ? (
        <HomeBeerusCarousel slides={slides} />
      ) : (
        qualified.length > 0 && <HomeHeroFrames frames={qualified} />
      )}
      <KintoUnVolant />
      <div className={styles.content}>
        <h1 className="sr-only">
          <T k="accueil.hero.title" />
        </h1>
        <div className={styles.heroBrandRow}>
          <img
            src="/brand/dragonballfr-logo.svg"
            alt=""
            width={416}
            height={106}
            fetchPriority="high"
            className={styles.siteLogo}
          />
          {hero.lede.trim() && <p className={styles.lede}>{hero.lede.trim()}</p>}
        </div>
        {/* The carousel already carries the hero actions; the editorial link would repeat them. */}
        {!carousel && hero.ctaLabel.trim() && hero.ctaHref.trim() && (
          <Link href={hero.ctaHref.trim()} className={styles.editorialLink}>
            {hero.ctaLabel.trim()}
          </Link>
        )}
      </div>
    </header>
  );
}
