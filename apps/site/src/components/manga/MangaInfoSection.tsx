import { ExternalLink } from "@shenron/ui/navigation/external";
import { BouclierCoche, CapsuleCorp, Livre, LienExterne } from "@shenron/ui/icones";
import Link from "next/link";
import { SectionHeading } from "@shenron/ui/layout/SectionHeading";

export function MangaInfoSection() {
  return (
    <section className="mt-16 space-y-8 lg:mt-24" aria-label="Éditeurs et formats officiels">
      <SectionHeading
        id="manga-editions-title"
        kicker="Guide de lecture"
        title="Éditeurs et formats officiels"
        standfirst="Les éditeurs officiels et les formats de publication de l’œuvre d’Akira Toriyama et de Dragon Ball Super."
        actions={
          <>
            <Link
              href="/sources/dragon-ball"
              className="inline-flex min-h-11 items-center text-sm font-semibold text-dbz-orange hover:text-white"
            >
              Sources vérifiées
            </Link>
            <Link
              href="/wiki/manga/interviews"
              className="inline-flex min-h-11 items-center text-sm font-semibold text-dbz-orange hover:text-white"
            >
              Interviews d’auteur
            </Link>
          </>
        }
      />

      {/* Grille principale 3 colonnes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* 1. Éditeurs Officiels */}
        <div className="dbz-panel p-6 border border-white/10 bg-dbz-card relative overflow-hidden group hover:border-dbz-orange/40 transition-all duration-300">
          <div className="relative z-10 space-y-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-dbz-orange/10 rounded-lg text-dbz-orange border border-dbz-orange/20">
                <CapsuleCorp className="w-6 h-6" />
              </div>
              <h3 className="font-display font-extrabold text-lg text-white">Éditeurs Officiels</h3>
            </div>

            <p className="text-xs text-white/70 leading-relaxed font-sans">
              Les maisons d&apos;édition historiques détentrices des droits de publication et
              responsables de l&apos;impression des tomes physiques.
            </p>

            <div className="space-y-4 pt-2">
              {/* Glénat */}
              <div className="border border-white/10 bg-black/40 p-4 rounded-lg space-y-2 group/item hover:border-white/20 transition-colors">
                <div className="flex items-center justify-between">
                  <h4 className="font-display font-bold text-sm text-white group-hover/item:text-dbz-orange transition-colors">
                    Glénat Manga (FR)
                  </h4>
                  <span className="text-[10px] px-2 py-0.5 bg-dbz-orange/20 text-dbz-orange border border-dbz-orange/30 rounded font-bold">
                    Officiel FR
                  </span>
                </div>
                <p className="text-xs text-white/75 font-sans leading-relaxed">
                  Éditeur historique français depuis 1993. Publie l&apos;édition originale en 42
                  volumes, la Perfect Edition (Kanzenban), la version Full Color ainsi que Dragon
                  Ball Super.
                </p>
                <ExternalLink
                  href="https://www.glenat.com/manga"
                  className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-semibold text-dbz-orange transition-colors hover:text-white"
                >
                  Visiter le catalogue Glénat <LienExterne size={12} />
                </ExternalLink>
              </div>

              {/* Shueisha */}
              <div className="border border-white/10 bg-black/40 p-4 rounded-lg space-y-2 group/item hover:border-white/20 transition-colors">
                <div className="flex items-center justify-between">
                  <h4 className="font-display font-bold text-sm text-white group-hover/item:text-dbz-orange transition-colors">
                    Shueisha (JP)
                  </h4>
                  <span className="text-[10px] px-2 py-0.5 bg-white/10 text-white/90 border border-white/20 rounded font-bold">
                    Original JP
                  </span>
                </div>
                <p className="text-xs text-white/75 font-sans leading-relaxed">
                  L&apos;éditeur japonais historique de l&apos;œuvre d&apos;Akira Toriyama dans le
                  magazine Weekly Shōnen Jump et de Dragon Ball Super dans le V Jump.
                </p>
                <ExternalLink
                  href="https://www.shueisha.co.jp"
                  className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-semibold text-dbz-orange transition-colors hover:text-white"
                >
                  Site officiel Shueisha <LienExterne size={12} />
                </ExternalLink>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Lecture Officielle & Numérique */}
        <div className="dbz-panel p-6 border border-white/10 bg-dbz-card relative overflow-hidden group hover:border-dbz-orange/40 transition-all duration-300">
          <div className="relative z-10 space-y-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-dbz-orange/10 rounded-lg text-dbz-orange border border-dbz-orange/20">
                <BouclierCoche className="w-6 h-6" />
              </div>
              <h3 className="font-display font-extrabold text-lg text-white">Lecture Numérique</h3>
            </div>

            <p className="text-xs text-white/70 leading-relaxed font-sans">
              Les plateformes certifiées pour suivre les chapitres en simultrad ou acquérir les
              tomes numériques officiels.
            </p>

            <div className="space-y-4 pt-2">
              {/* Manga Plus */}
              <div className="border border-white/10 bg-black/40 p-4 rounded-lg space-y-2 group/item hover:border-white/20 transition-colors">
                <div className="flex items-center justify-between">
                  <h4 className="font-display font-bold text-sm text-white group-hover/item:text-dbz-orange transition-colors">
                    MANGA Plus
                  </h4>
                  <span className="text-[10px] px-2 py-0.5 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded font-bold">
                    Simultrad Shueisha
                  </span>
                </div>
                <p className="text-xs text-white/75 font-sans leading-relaxed">
                  Service officiel mondial de la Shueisha. Permet de lire gratuitement en ligne les
                  derniers chapitres de Dragon Ball Super en simultané avec la parution au Japon.
                </p>
                <ExternalLink
                  href="https://mangaplus.shueisha.co.jp"
                  className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-semibold text-dbz-orange transition-colors hover:text-white"
                >
                  Accéder à Manga Plus <LienExterne size={12} />
                </ExternalLink>
              </div>

              {/* Izneo / Numérique */}
              <div className="border border-white/10 bg-black/40 p-4 rounded-lg space-y-2 group/item hover:border-white/20 transition-colors">
                <div className="flex items-center justify-between">
                  <h4 className="font-display font-bold text-sm text-white group-hover/item:text-dbz-orange transition-colors">
                    Izneo & Glénat Numérique
                  </h4>
                  <span className="text-[10px] px-2 py-0.5 bg-dbz-orange/20 text-dbz-orange border border-dbz-orange/30 rounded font-bold">
                    ePub Officiel
                  </span>
                </div>
                <p className="text-xs text-white/75 font-sans leading-relaxed">
                  Catalogue complet des volumes officiels de Dragon Ball et Dragon Ball Super au
                  format numérique haute définition en langue française.
                </p>
                <ExternalLink
                  href="https://www.izneo.com"
                  className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-semibold text-dbz-orange transition-colors hover:text-white"
                >
                  Consulter sur Izneo <LienExterne size={12} />
                </ExternalLink>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Formats & Éditions */}
        <div className="dbz-panel p-6 border border-white/10 bg-dbz-card relative overflow-hidden group hover:border-dbz-orange/40 transition-all duration-300">
          <div className="relative z-10 space-y-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-dbz-orange/10 rounded-lg text-dbz-orange border border-dbz-orange/20">
                <Livre className="w-6 h-6" />
              </div>
              <h3 className="font-display font-extrabold text-lg text-white">Formats & Éditions</h3>
            </div>

            <p className="text-xs text-white/70 leading-relaxed font-sans">
              Les trois éditions majeures sous lesquelles l&apos;œuvre canonique d&apos;Akira
              Toriyama a été publiée.
            </p>

            <div className="space-y-4 pt-2">
              <div className="border border-white/10 bg-black/40 p-3.5 rounded-lg space-y-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-display font-bold text-sm text-white">
                    Tankōbon (Originale)
                  </h4>
                  <span className="text-[10px] text-dbz-orange font-bold">42 tomes</span>
                </div>
                <p className="text-xs text-white/70 font-sans leading-relaxed">
                  Format de poche classique (1985-1995), reprenant les 519 chapitres du manga
                  original.
                </p>
              </div>

              <div className="border border-white/10 bg-black/40 p-3.5 rounded-lg space-y-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-display font-bold text-sm text-white">Kanzenban (Perfect)</h4>
                  <span className="text-[10px] text-dbz-orange font-bold">34 tomes</span>
                </div>
                <p className="text-xs text-white/70 font-sans leading-relaxed">
                  Grand format avec papier noble, planches en bichromie/quadrichromie restaurées et
                  fin retouchée par l&apos;auteur.
                </p>
              </div>

              <div className="border border-white/10 bg-black/40 p-3.5 rounded-lg space-y-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-display font-bold text-sm text-white">Full Color</h4>
                  <span className="text-[10px] text-dbz-orange font-bold">32 tomes</span>
                </div>
                <p className="text-xs text-white/70 font-sans leading-relaxed">
                  Colorisation numérique officielle par la Shueisha, découpée par sagas (Saiyans,
                  Freezer, Cell, Buu).
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
