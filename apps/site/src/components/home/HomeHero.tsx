import { T } from "@/components/T";
import type { HomeConfig } from "@/lib/home-scenes";
import { canonicalFrameUrl } from "@/lib/episode-frame-banner";
import { HomeSearch } from "./HomeSearch";
import { KintoUnVolant } from "./KintoUnVolant";
import { HomeBeerusFeature, type BeerusFeature } from "./HomeBeerusFeature";
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
  return (
    <header id="hero" className={`${styles.hero} ${className}`}>
      {qualified.length > 0 && <HomeHeroFrames frames={qualified} />}
      <KintoUnVolant />
      <div className={styles.content}>
        <h1 className="sr-only">
          <T k="accueil.hero.title" />
        </h1>
        <img
          src="/brand/dragonballfr-logo.svg"
          alt=""
          width={416}
          height={106}
          fetchPriority="high"
          className={styles.siteLogo}
        />
        {hero.lede.trim() && <p className={styles.lede}>{hero.lede.trim()}</p>}
        {beerus?.latest && <HomeBeerusFeature beerus={beerus} />}
        {hero.ctaLabel.trim() && hero.ctaHref.trim() && (
          <Link href={hero.ctaHref.trim()} className={styles.editorialLink}>
            {hero.ctaLabel.trim()}
          </Link>
        )}
      </div>
      <div className={styles.search}>
        <HomeSearch />
      </div>
    </header>
  );
}
