/**
 * The home hero: the cover wordmark (« DRAGON » with the one-star ball in its O, « BALL » in
 * red, as on the tankōbon and Dragon Ball Super covers), the flying Kinto-Un, the hero clips
 * behind, then the page title, the lede edited in `/admin/home` and the search — the first
 * gesture of the page.
 *
 * Server component; the clips, the cloud and the search are the client islands.
 */
import Link from "next/link";
import Image from "next/image";
import {
  DragonBall,
  LETTRES_BALL,
  LETTRES_DRAGON_APRES_BOULE,
  LETTRES_DRAGON_AVANT_BOULE,
  MotManga,
} from "@aphrody/shenron-ui/toriyama";
import { T } from "@/components/T";
import type { HomeConfig } from "@/lib/home-scenes";
import { HomeHeroScenes } from "./HomeHeroScenes";
import { HomeSearch } from "./HomeSearch";
import { KintoUnVolant } from "./KintoUnVolant";
import { focusRing } from "./ui";

const BEERUS_ARTWORK = "/banners/dbs-beerus-2026.jpg";

export function HomeHero({
  hero,
  className = "",
}: {
  hero: HomeConfig["hero"];
  className?: string;
}) {
  const lede = hero.lede.trim();
  const cta = hero.ctaLabel.trim() && hero.ctaHref.trim() ? hero : null;
  return (
    <header
      id="hero"
      className={`home-stage relative isolate min-w-0 overflow-hidden border-b border-white/[0.08] ${className}`}
    >
      <HomeHeroScenes scenes={hero.scenes} />
      <div className="home-hero__beerus" aria-hidden="true">
        <Image
          src={BEERUS_ARTWORK}
          alt=""
          fill
          priority
          sizes="(max-width: 767px) 100vw, 52vw"
          className="object-cover object-center"
        />
      </div>
      <KintoUnVolant />
      <div className="page-shell relative z-[3] flex min-h-[clamp(26rem,72svh,46rem)] flex-col justify-end pt-[clamp(3rem,10vh,6rem)] pb-[clamp(2rem,6vh,3.5rem)]">
        {/* The wordmark IS the page title: one heading, drawn. A second visible title
            (« Dragon Ball, en français et sourcé ») repeated the wordmark and the lede word for
            word. Its text stays the accessible name of the h1. */}
        <h1 className="m-0">
          <span className="sr-only">
            <T k="accueil.hero.title" />
          </span>
          <span aria-hidden className="home-wordmark home-wordmark--stage">
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
        {lede ? (
          <p className="mt-5 max-w-[72ch] text-base leading-relaxed text-os/85 lg:text-[1.0625rem]">
            {lede}
          </p>
        ) : null}
        <HomeSearch className="mt-6 max-w-3xl">
          {cta ? (
            <Link
              href={cta.ctaHref}
              className={`inline-flex min-h-11 items-center rounded-md text-sm font-semibold text-dbz-orange transition-colors hover:text-gi-clair ${focusRing}`}
            >
              {cta.ctaLabel}
            </Link>
          ) : null}
        </HomeSearch>
      </div>
    </header>
  );
}
