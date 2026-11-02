"use client";

import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { SignInDiscord } from "@/components/SignInDiscord";
import { SignOut } from "@/components/SignOut";
import { Bouclier, Curseurs, DragonBall, Piece } from "@aphrody/shenron-ui/icones";
import { useMe } from "@/lib/use-me";
import { useLangue } from "@/lib/i18n/client";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "@aphrody/shenron-ui/popover";

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
  "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring";
const ICON =
  "grid h-11 w-11 shrink-0 place-items-center rounded-xl text-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground";

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
      <Popover>
        <PopoverTrigger
          aria-label={me.username ? `${dico.common.mySpace} — ${me.username}` : dico.common.mySpace}
          className={`shenron-account-trigger ${ICON} ${FOCUS}`}
        >
          <Avatar src={me.avatar} size={28} className="ring-1 ring-border" />
        </PopoverTrigger>
        <PopoverPopup variant="planche" align="end" className="w-60 max-w-[calc(100vw-1rem)] gap-1">
          <PopoverTitle className="px-3 py-2">{me.username ?? dico.common.mySpace}</PopoverTitle>
          <Link href="/dashboard" className={`shenron-account-option ${FOCUS}`}>
            <DragonBall size={18} />
            {dico.common.mySpace}
          </Link>
          <Link href="/account/billing" className={`shenron-account-option ${FOCUS}`}>
            <Piece size={18} />
            {dico.billing.accountTitle}
          </Link>
          {me.isAdmin && (
            <Link href="/admin" className={`shenron-account-option ${FOCUS}`}>
              <Bouclier size={18} />
              {dico.nav.admin}
            </Link>
          )}
          <Link href="/settings" className={`shenron-account-option ${FOCUS}`}>
            <Curseurs size={18} />
            {dico.mobileNav.accountSettings}
          </Link>
          <SignOut className={`shenron-account-option w-full disabled:opacity-50 ${FOCUS}`}>
            <LogoutGlyph />
            {dico.common.signOut}
          </SignOut>
        </PopoverPopup>
      </Popover>
    ) : (
      <SignInDiscord className={`${ICON} ${FOCUS}`}>
        <DragonBall size={20} />
        {/* `SignInDiscord` ne relaie pas `aria-label` : le nom vient du texte masqué. */}
        <span className="sr-only">{dico.common.signInDiscord}</span>
      </SignInDiscord>
    );
  }

  if (variant === "sheet") {
    if (!me.authenticated) {
      return (
        <div className="flex flex-col gap-2">
          <SignInDiscord
            className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-display text-[0.875rem] font-bold text-primary-foreground ${FOCUS}`}
          >
            <DragonBall size={18} />
            {dico.common.signInDiscord}
          </SignInDiscord>
          <Link
            href="/signin"
            className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-secondary px-4 font-display text-[0.8125rem] font-semibold text-secondary-foreground transition-colors hover:bg-primary hover:text-primary-foreground ${FOCUS}`}
          >
            {dico.common.signInOtherMethods}
          </Link>
        </div>
      );
    }
    const row = `flex min-h-12 items-center gap-3 rounded-xl px-4 font-display text-[0.875rem] font-semibold text-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground ${FOCUS}`;
    return (
      <div className="flex flex-col">
        <Link href="/account/billing" className={row}>
          <Piece size={18} />
          {dico.billing.accountTitle}
        </Link>
        {me.isAdmin && (
          <Link href="/admin" className={row}>
            <Bouclier size={18} />
            {dico.nav.admin}
          </Link>
        )}
        <Link href="/settings" className={row}>
          <Curseurs size={18} />
          {dico.mobileNav.accountSettings}
        </Link>
        <SignOut className={`${row} mt-2 w-full border-t border-border pt-2 disabled:opacity-50`}>
          <LogoutGlyph />
          {dico.common.signOut}
        </SignOut>
      </div>
    );
  }

  // Barre latérale.
  if (!me.authenticated) {
    return (
      <div className="flex flex-col gap-1.5">
        <SignInDiscord
          className={`flex min-h-11 w-full items-center gap-3 rounded-lg border border-border bg-secondary px-3 font-display text-[0.8125rem] font-bold text-secondary-foreground transition-colors hover:bg-primary hover:text-primary-foreground ${FOCUS}`}
        >
          <DragonBall size={18} />
          {dico.common.signInDiscord}
        </SignInDiscord>
        <Link
          href="/signin"
          className={`flex min-h-11 w-full items-center justify-center rounded-lg px-3 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground ${FOCUS}`}
        >
          {dico.common.signInOtherMethods}
        </Link>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <Link
        href="/dashboard"
        title={me.username ? `${dico.common.mySpace} — ${me.username}` : dico.common.mySpace}
        className={`flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 text-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground ${FOCUS}`}
      >
        <Avatar src={me.avatar} size={28} className="shrink-0 ring-1 ring-border" />
        <span className="min-w-0 truncate text-[0.8125rem] font-semibold">
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
          <Bouclier size={18} />
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
