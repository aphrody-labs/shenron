/**
 * The home hero: the cover wordmark (« DRAGON » with the one-star ball in its O, « BALL » in
 * red, as on the tankōbon and Dragon Ball Super covers), the flying Kinto-Un,
 * a qualified still frame (or, without one, the four-star ball in real-time 3D), then the lede edited in `/admin/home` and the search — the first
 * gesture of the page.
 *
 * Server component; the cloud and the search are the client islands.
 */
import Image from "next/image";
import {
  DragonBall,
  DragonBall3D,
  LETTRES_BALL,
  LETTRES_DRAGON_APRES_BOULE,
  LETTRES_DRAGON_AVANT_BOULE,
  MotManga,
} from "@aphrody/shenron-ui/toriyama";
import { T } from "@/components/T";
import type { HomeConfig } from "@/lib/home-scenes";
import { HomeSearch } from "./HomeSearch";
import { KintoUnVolant } from "./KintoUnVolant";
import { canonicalFrameUrl } from "@/lib/episode-frame-banner";

export function HomeHero({
  hero,
  heroFrame,
  className = "",
}: {
  hero: HomeConfig["hero"];
  heroFrame?: string;
  className?: string;
}) {
  const lede = hero.lede.trim();
  const frame = canonicalFrameUrl(heroFrame ?? null);
  return (
    <header
      id="hero"
      className={`home-stage relative isolate min-w-0 overflow-hidden border-b border-white/[0.08] ${className}`}
    >
      {frame && (
        <div className="home-hero__beerus" aria-hidden="true">
          <Image
            src={frame}
            alt=""
            fill
            priority
            sizes="(max-width: 767px) 100vw, 52vw"
            className="object-cover object-center"
          />
        </div>
      )}
      {!frame && (
        <div
          className="home-hero__ball pointer-events-none absolute right-[7%] top-1/2 z-[2] hidden -translate-y-1/2 md:block"
          aria-hidden="true"
        >
          <DragonBall3D stars={4} size="clamp(11rem, 22vw, 20rem)" decorative />
        </div>
      )}
      <KintoUnVolant />
      <div className="page-shell relative z-[3] flex min-h-60 flex-col justify-end py-5 sm:min-h-72 sm:py-6">
        {/* The wordmark IS the page title: one heading, drawn. A second visible title
            (« Dragon Ball, en français et sourcé ») repeated the wordmark and the lede word for
            word. Its text stays the accessible name of the h1. */}
        <h1 className="m-0">
          <span className="sr-only">
            <T k="accueil.hero.title" />
          </span>
          <span
            aria-hidden
            className="home-wordmark"
            style={{ fontSize: "clamp(3rem, 6vw, 5.5rem)" }}
          >
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
          <p className="mt-3 max-w-[56ch] text-sm leading-relaxed text-os/85">{lede}</p>
        ) : null}
        <HomeSearch className="mt-3 max-w-2xl" />
      </div>
    </header>
  );
}
