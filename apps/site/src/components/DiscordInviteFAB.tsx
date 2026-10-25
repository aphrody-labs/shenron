/* oxlint-disable react/set-state-in-effect -- legacy UI kept as-is (behavior-preserving lint pass) */
"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useT } from "@/components/T";
import { DISCORD_INVITE } from "@/lib/config";

/** Scroll depth past which the invitation folds into its icon. */
const FOLD_AT = 160;

/**
 * Discord invitation. Hidden on the home, whose live server panel already invites to the
 * server; kept in the document flow on wiki pages so it never covers editorial content.
 */
export function DiscordInviteFAB({ inline = false }: { inline?: boolean }) {
  const t = useT();
  const pathname = usePathname();
  const wikiPage = pathname === "/wiki" || pathname.startsWith("/wiki/");
  const mediaPage = /^\/wiki\/(?:episodes\/(?:\d+|series\/[^/]+\/\d+)|movies\/[^/]+)\/?$/.test(
    pathname,
  );
  const inFlow = inline || wikiPage || mediaPage;
  const [isVisible, setIsVisible] = useState(false);
  const [folded, setFolded] = useState(false);

  useEffect(() => {
    const onScroll = () => setFolded(window.scrollY > FOLD_AT);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // `localStorage` LÈVE une exception, il ne rend pas `null`, quand le stockage
  // est interdit (navigation privée verrouillée, cookies tiers bloqués, page
  // servie dans une iframe cloisonnée). Levée depuis un effet, elle remonte à
  // la frontière d'erreur : toute la page bascule sur le panneau « ANOMALIE
  // COSMIQUE » à cause d'une pastille d'invitation. On dégrade au lieu de
  // casser — la pastille s'affiche, faute de pouvoir savoir qu'elle a été
  // écartée.
  useEffect(() => {
    let dismissed: string | null = null;
    try {
      dismissed = localStorage.getItem("dbfr_fab_dismissed");
    } catch {
      /* stockage indisponible */
    }
    if (!dismissed) setIsVisible(true);
  }, []);

  if (
    !isVisible ||
    pathname === "/" ||
    (pathname === "/desktop" && !inline) ||
    (wikiPage && !inline)
  )
    return null;

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      localStorage.setItem("dbfr_fab_dismissed", "true");
    } catch {
      /* le choix ne survivra pas au rechargement, la pastille se ferme quand même */
    }
    setIsVisible(false);
  };

  const inviteUrl = DISCORD_INVITE;

  return (
    /* Empilé AU-DESSUS du bouton « Signaler une erreur », qui occupe désormais
		   le coin bas gauche : deux pastilles à la même position se recouvraient,
		   et c'est l'invitation Discord (z-50) qui masquait le signalement (z-40). */
    <div
      data-inline={inFlow || undefined}
      className={`fab-discord fab-secondary ${inFlow ? "relative mx-auto my-4 w-fit" : "fixed bottom-[4.5rem] left-4 z-50 md:bottom-[5.5rem] md:left-6"}`}
    >
      <div className="relative inline-block">
        <button
          type="button"
          onClick={handleDismiss}
          aria-label={t("shell.close")}
          // Le carré visible reste petit (24 px, pour ne pas manger la pastille),
          // mais la ZONE TACTILE fait 44 px via un pseudo-élément : c'était le
          // plus petit contrôle du site, et fermer une pastille flottante au
          // pouce relevait de la chance.
          className="cible-44 absolute -top-2 -right-2 w-6 h-6 rounded-full bg-dbz-bg border border-dbz-border hover:border-fuchsia-400 text-white/70 hover:text-white flex items-center justify-center text-xs leading-none transition-colors z-10"
        >
          ×
        </button>
        <a
          href={inviteUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={folded && !inFlow ? t("footer.joinDiscord") : undefined}
          className={`dbz-button inline-flex items-center gap-2.5 !text-xs md:!text-sm ${
            folded && !inFlow ? "!p-2.5" : "!py-2.5 !px-4"
          }`}
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden>
            <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.07.07 0 0 0-.073.035 13.86 13.86 0 0 0-.61 1.255 18.27 18.27 0 0 0-5.488 0 12.51 12.51 0 0 0-.617-1.255.07.07 0 0 0-.073-.035A19.74 19.74 0 0 0 3.687 4.37a.06.06 0 0 0-.03.025C.533 9.046-.32 13.58.099 18.06a.08.08 0 0 0 .03.054 19.9 19.9 0 0 0 5.993 3.03.07.07 0 0 0 .078-.027 14.27 14.27 0 0 0 1.226-1.994.07.07 0 0 0-.038-.097 13.11 13.11 0 0 1-1.872-.892.07.07 0 0 1-.008-.118c.126-.094.252-.192.372-.291a.07.07 0 0 1 .07-.01c3.927 1.793 8.18 1.793 12.062 0a.07.07 0 0 1 .072.01c.12.1.245.198.372.292a.07.07 0 0 1-.006.118 12.3 12.3 0 0 1-1.873.891.07.07 0 0 0-.037.098 16.04 16.04 0 0 0 1.225 1.994.07.07 0 0 0 .078.028 19.84 19.84 0 0 0 6.002-3.03.08.08 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.665a.06.06 0 0 0-.029-.025zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.418 2.157-2.418 1.212 0 2.176 1.094 2.157 2.418 0 1.334-.955 2.42-2.157 2.42zm7.974 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.418 2.157-2.418 1.212 0 2.176 1.094 2.157 2.418 0 1.334-.945 2.42-2.157 2.42z" />
          </svg>
          <span className={folded && !inFlow ? "sr-only" : undefined}>
            {t("footer.joinDiscord")}
          </span>
        </a>
      </div>
    </div>
  );
}
