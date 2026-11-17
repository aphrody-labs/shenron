import Link from "next/link";
import { DragonBall } from "@aphrody/shenron-ui/toriyama";
import { VieArt } from "@aphrody/shenron-ui/vie/VieArt";
import { T } from "@/components/T";

export default function NotFound() {
  return (
    <div className="container mx-auto px-4 py-24 max-w-2xl text-center">
      <div className="dbz-panel p-12 relative overflow-hidden">
        <div className="absolute inset-0 starfield opacity-30 pointer-events-none" />
        <VieArt kind="kinto" className="mx-auto -mt-4 mb-2 scale-90" />
        <div className="relative">
          <p className="font-scouter text-xs tracking-[0.5em] text-fuchsia-300 mb-4">
            ❯ <T k="vie.notFound.sector" /> ❮
          </p>
          <h1 className="title-jagged text-7xl md:text-9xl leading-none mb-6">
            <T k="vie.notFound.title" />
          </h1>
          <p className="text-white/70 mb-2">
            <T k="vie.notFound.line1" />
          </p>
          <p className="text-white/50 text-sm mb-8">
            <T k="vie.notFound.line2" />
          </p>
          {/* Les 7 Dragon Balls dispersées — décor thématique (cf. components/DragonBall).
					    `decorative` : elles n'ajoutent rien à la page 404, et sans lui le
					    lecteur d'écran énumérait « Dragon Ball à 1 étoile… à 7 étoiles »
					    entre le message d'erreur et les deux liens de sortie. */}
          <div className="mb-9 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
            {([1, 2, 3, 4, 5, 6, 7] as const).map((s) => (
              <DragonBall
                key={s}
                stars={s}
                size={34}
                decorative
                className="drop-shadow-[0_0_10px_rgba(245,191,65,0.55)] transition-transform hover:-translate-y-1"
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/" className="dbz-button !text-xs">
              <T k="vie.notFound.home" />
            </Link>
            <Link href="/wiki/manga" className="dbz-button-ghost !text-xs">
              <T k="vie.notFound.manga" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
