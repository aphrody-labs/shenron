"use client";

import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { SignInDiscord } from "@/components/SignInDiscord";
import { SignOut } from "@/components/SignOut";
import { Curseurs, DragonBall } from "@aphrody/shenron-ui/icones";
import { useMe } from "@/lib/use-me";
import { useLangue } from "@/lib/i18n/client";

/**
 * Le compte dans le shell (îlot client). L'état d'auth vient de `/api/me` côté client : le
 * layout et les pages restent statiques et cacheables.
 *
 * - `sidebar` : pied de la barre latérale desktop — avatar, pseudo, réglages, déconnexion ;
 * - `compact` : barre du haut mobile — l'avatar seul (44 px), ou l'entrée de connexion ;
 * - `sheet`   : bas de la feuille « Plus » — réglages, déconnexion, seule porte de ces
 *   actions sur mobile.
 *
 * The administration entry follows the authenticated response from `/api/me`.
 */
const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-dbz-orange";
const ICON =
  "grid h-11 w-11 shrink-0 place-items-center rounded-lg text-os/70 transition-colors hover:bg-os/[0.07] hover:text-os";

function LogoutGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export function NavAuth({ variant }: { variant: "sidebar" | "compact" | "sheet" }) {
  const me = useMe();
  const { dico } = useLangue();

  // Gabarit réservé tant que /api/me n'a pas répondu (anti-CLS).
  if (me === undefined) {
    if (variant === "sheet") return null;
    return <div className={variant === "compact" ? "h-11 w-11" : "h-12"} aria-hidden />;
  }

  if (variant === "compact") {
    return me.authenticated ? (
      <div className="flex shrink-0 items-center gap-1">
        {me.isAdmin && (
          <Link
            href="/admin"
            aria-label={dico.nav.admin}
            title={dico.nav.admin}
            className={`${ICON} ${FOCUS}`}
          >
            <Curseurs size={20} />
          </Link>
        )}
        <Link
          href="/dashboard"
          aria-label={me.username ? `${dico.common.mySpace} — ${me.username}` : dico.common.mySpace}
          className={`grid h-11 w-11 place-items-center rounded-full transition-colors hover:bg-os/[0.08] ${FOCUS}`}
        >
          <Avatar src={me.avatar} size={28} className="ring-1 ring-white/15" />
        </Link>
      </div>
    ) : (
      <SignInDiscord
        className={`grid h-11 w-11 place-items-center rounded-full text-os/70 transition-colors hover:bg-os/[0.08] hover:text-os ${FOCUS}`}
      >
        <DragonBall size={20} />
        {/* `SignInDiscord` ne relaie pas `aria-label` : le nom vient du texte masqué. */}
        <span className="sr-only">{dico.common.signInDiscord}</span>
      </SignInDiscord>
    );
  }

  if (variant === "sheet") {
    if (!me.authenticated) {
      return (
        <SignInDiscord
          className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-dbz-orange font-display text-[0.875rem] font-bold text-black ${FOCUS}`}
        >
          <DragonBall size={18} />
          {dico.common.signInDiscord}
        </SignInDiscord>
      );
    }
    const row = `flex min-h-12 items-center gap-3 rounded-xl px-4 font-display text-[0.875rem] font-semibold text-os/80 transition-colors hover:bg-os/[0.06] hover:text-os ${FOCUS}`;
    return (
      <div className="flex flex-col">
        {me.isAdmin && (
          <Link href="/admin" className={row}>
            <Curseurs size={18} />
            {dico.nav.admin}
          </Link>
        )}
        <Link href="/settings" className={row}>
          <Curseurs size={18} />
          {dico.mobileNav.accountSettings}
        </Link>
        <SignOut className={`${row} w-full disabled:opacity-50`}>
          <LogoutGlyph />
          {dico.common.signOut}
        </SignOut>
      </div>
    );
  }

  // Barre latérale.
  if (!me.authenticated) {
    return (
      <SignInDiscord
        className={`flex min-h-11 w-full items-center gap-3 rounded-lg border border-dbz-orange/50 bg-dbz-orange/10 px-3 font-display text-[0.8125rem] font-bold text-dbz-orange transition-colors hover:bg-dbz-orange hover:text-black ${FOCUS}`}
      >
        <DragonBall size={18} />
        {dico.common.signInDiscord}
      </SignInDiscord>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <Link
        href="/dashboard"
        title={me.username ? `${dico.common.mySpace} — ${me.username}` : dico.common.mySpace}
        className={`flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 transition-colors hover:bg-os/[0.06] ${FOCUS}`}
      >
        <Avatar src={me.avatar} size={28} className="shrink-0 ring-1 ring-white/15" />
        <span className="min-w-0 truncate text-[0.8125rem] font-semibold text-os/85">
          {me.username ?? dico.common.mySpace}
        </span>
      </Link>
      {me.isAdmin && (
        <Link
          href="/admin"
          aria-label={dico.nav.admin}
          title={dico.nav.admin}
          className={`${ICON} ${FOCUS}`}
        >
          <Curseurs size={18} />
        </Link>
      )}
      <Link
        href="/settings"
        aria-label={dico.common.settings}
        title={dico.common.settings}
        className={`${ICON} ${FOCUS}`}
      >
        <Curseurs size={18} />
      </Link>
      <SignOut
        aria-label={dico.common.signOut}
        className={`${ICON} hover:text-dbz-red disabled:opacity-50 ${FOCUS}`}
      >
        <LogoutGlyph />
      </SignOut>
    </div>
  );
}
