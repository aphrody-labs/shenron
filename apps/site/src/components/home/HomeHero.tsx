/**
 * The home hero: the cover wordmark (« DRAGON » with the one-star ball in its O, « BALL » in
 * red, as on the tankōbon and Dragon Ball Super covers), the flying Kinto-Un, the hero clips
 * behind, then the page title, the lede edited in `/admin/home` and the search — the first
 * gesture of the page.
 *
 * Server component; the clips, the cloud and the search are the client islands.
 */
import Link from "next/link";
import {
  DragonBall,
  LETTRES_BALL,
  LETTRES_DRAGON_APRES_BOULE,
  LETTRES_DRAGON_AVANT_BOULE,
  MotManga,
} from "@shenron/ui/toriyama";
import { T } from "@/components/T";
import type { HomeConfig } from "@/lib/home-scenes";
import { HomeHeroScenes } from "./HomeHeroScenes";
import { HomeSearch } from "./HomeSearch";
import { KintoUnVolant } from "./KintoUnVolant";
import { focusRing } from "./ui";

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
      className={`home-stage relative isolate min-w-0 overflow-hidden border-b border-white/[0.08] ${className}`}
    >
      <HomeHeroScenes scenes={hero.scenes} />
      <KintoUnVolant />
      <div className="page-shell relative z-[3] flex min-h-[clamp(26rem,72svh,46rem)] flex-col justify-end pt-[clamp(3rem,10vh,6rem)] pb-[clamp(2rem,6vh,3.5rem)]">
        {/* The wordmark is the brand mark, drawn: the accessible title is the h1 below. */}
        <div aria-hidden className="home-wordmark home-wordmark--stage">
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
        </div>
        {/* Optical size left to the text size (not the global h1 `opsz 144`, a display cut
            whose spacing closes up at this size) and no negative tracking: the title read
            squashed under the wordmark. */}
        <h1 className="mt-5 max-w-[30ch] text-2xl leading-tight font-extrabold tracking-normal text-os [font-variation-settings:'ROND'_100] sm:text-3xl lg:text-4xl">
          <T k="accueil.hero.title" />
        </h1>
        {lede ? (
          <p className="mt-3 max-w-[72ch] text-base leading-relaxed text-os/85 lg:text-[1.0625rem]">
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
