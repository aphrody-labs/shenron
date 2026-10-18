import {
  DragonBall,
  LETTRES_BALL,
  LETTRES_DRAGON_APRES_BOULE,
  LETTRES_DRAGON_AVANT_BOULE,
  MotManga,
} from "@aphrody/shenron-ui/toriyama";
import { T } from "@/components/T";
import type { HomeConfig } from "@/lib/home-scenes";
import { canonicalFrameUrl } from "@/lib/episode-frame-banner";
import { HomeSearch } from "./HomeSearch";
import { KintoUnVolant } from "./KintoUnVolant";
import { HomeBeerusFeature, type BeerusFeature } from "./HomeBeerusFeature";
import { HomeHeroFrames } from "./HomeHeroFrames";
import styles from "./HomeHero.module.css";

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
        <h1 className={styles.identity}>
          <span className="sr-only">
            <T k="accueil.hero.title" />
          </span>
          <span aria-hidden className="home-wordmark">
            <span className="home-wordmark__ligne">
              <span className="wordmark-manga">
                <MotManga lettres={LETTRES_DRAGON_AVANT_BOULE} />
                <span className="wordmark-boule">
                  <DragonBall stars={1} size={64} decorative />
                </span>
                <MotManga lettres={LETTRES_DRAGON_APRES_BOULE} />
              </span>
              <span className="wordmark-manga wordmark-manga--rouge">
                <MotManga lettres={LETTRES_BALL} />
              </span>
            </span>
            <em>France</em>
          </span>
        </h1>
        {beerus?.latest ? (
          <HomeBeerusFeature beerus={beerus} />
        ) : hero.lede.trim() ? (
          <p className={styles.lede}>{hero.lede.trim()}</p>
        ) : null}
      </div>
      <div className={styles.search}>
        <HomeSearch />
      </div>
    </header>
  );
}
