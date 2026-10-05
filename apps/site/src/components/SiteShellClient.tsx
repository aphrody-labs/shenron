"use client";
// SPDX-License-Identifier: Apache-2.0
/**
 * Branchement du site sur la coque `@shenron/ui/navigation/AppShell` : routeur Next (liens
 * préchargés à l'intention), langue, compte, palette ⌘K et application de bureau.
 *
 * Ce que le serveur ne peut pas savoir sans perdre le cache CDN se décide ici, après
 * l'hydratation : l'espace membre n'apparaît qu'une fois connecté, les rubriques fermées
 * seulement pour le staff, l'entrée « Bureau » (`/desktop`) seulement dans la fenêtre Tauri.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AppShell,
  type ShellLabels,
  type ShellLinkProps,
  type ShellNavItem,
  type ShellNavSection,
} from "@shenron/ui/navigation/AppShell";
import {
  Cadenas,
  CapsuleCorp,
  Crayon,
  DragonRadar,
  Film,
  Kame,
  Maison,
  MaisonPleine,
  PlancheManga,
  Scouter,
  Tv,
} from "@shenron/ui/icones";
import { KintoUn } from "@shenron/ui/toriyama/KintoUn";
import { isTauri } from "@shenron/ui/studio/tauri-bridge";
import { CommandMenu } from "@/components/CommandMenu";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { NavAuth } from "@/components/NavAuth";
import { useLangue, useRubrique } from "@/lib/i18n/client";
import { MOBILE_PRIMARY_DESTINATIONS } from "@/lib/site-menu";
import type { Journey } from "@/lib/site-map";
import { useMe } from "@/lib/use-me";

export interface ShellJourney {
  key: Journey;
  label: string;
  items: { href: string; label: string; description?: string; member: boolean }[];
}

const JOURNEY_ICONS: Partial<Record<Journey, ReactNode>> = {
  decouvrir: <Maison size={18} />,
  encyclopedie: <DragonRadar size={18} />,
  oeuvres: <Tv size={18} />,
  archives: <PlancheManga size={18} />,
  communaute: <Kame size={18} />,
  participer: <Crayon size={18} />,
  espace: <CapsuleCorp size={18} />,
};

const TAB_ICONS: Record<string, { icon: ReactNode; activeIcon?: ReactNode }> = {
  "/": { icon: <Maison size={22} />, activeIcon: <MaisonPleine size={22} /> },
  "/desktop": { icon: <Scouter size={22} /> },
  "/wiki": { icon: <DragonRadar size={22} /> },
  "/wiki/episodes": { icon: <Tv size={22} /> },
  "/wiki/movies": { icon: <Film size={22} /> },
};

/**
 * Lien de navigation : pas de préchargement à l'affichage (la barre latérale porte plusieurs
 * dizaines de liens, autant de requêtes à chaque page), mais dès l'intention — survol, focus
 * clavier ou toucher —, ce qui laisse ~100 ms d'avance au clic.
 */
function NavLink({ href, children, ...rest }: ShellLinkProps) {
  const router = useRouter();
  const prefetch = useCallback(() => {
    if (href.startsWith("/")) router.prefetch(href);
  }, [router, href]);
  return (
    <Link
      href={href}
      prefetch={false}
      onPointerEnter={prefetch}
      onFocus={prefetch}
      onTouchStart={prefetch}
      {...rest}
    >
      {children}
    </Link>
  );
}

export function SiteShellClient({
  journeys,
  staff,
  footer,
  children,
}: {
  journeys: readonly ShellJourney[];
  staff: readonly { href: string; label: string }[];
  footer?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "/";
  const me = useMe();
  const { dico } = useLangue();
  const rubrique = useRubrique();
  const [desktop, setDesktop] = useState(false);
  const [armed, setArmed] = useState(false);

  useEffect(() => setDesktop(isTauri()), []);

  const labels = useMemo<ShellLabels>(
    () => ({
      sidebar: dico.shell.sidebar,
      collapseSidebar: dico.shell.collapseSidebar,
      expandSidebar: dico.shell.expandSidebar,
      primaryNav: dico.shell.primaryNav,
      more: dico.shell.more,
      moreTitle: dico.shell.moreTitle,
      close: dico.shell.close,
      search: dico.shell.search,
      breadcrumb: dico.shell.breadcrumb,
      back: dico.shell.back,
      home: dico.shell.home,
      windowMinimize: dico.shell.windowMinimize,
      windowMaximize: dico.shell.windowMaximize,
      windowRestore: dico.shell.windowRestore,
      windowClose: dico.shell.windowClose,
    }),
    [dico],
  );

  const sections = useMemo<ShellNavSection[]>(() => {
    const translate = (item: { href: string; label: string; description?: string }) => {
      const t = rubrique(item.href, { label: item.label, note: item.description });
      return { href: item.href, label: t.label, description: t.note };
    };
    const out: ShellNavSection[] = journeys.map((journey) => ({
      id: journey.key,
      label: dico.shell.journeys[journey.key as keyof typeof dico.shell.journeys] ?? journey.label,
      icon: JOURNEY_ICONS[journey.key],
      items: journey.items.filter((item) => !item.member || me?.authenticated).map(translate),
    }));
    if (desktop) {
      const discover = out.find((section) => section.id === "decouvrir");
      const desktopHome: ShellNavItem = {
        href: "/desktop",
        label: dico.shell.desktop,
        description: dico.shell.desktopHint,
      };
      if (discover) discover.items = [desktopHome, ...discover.items];
      else
        out.unshift({
          id: "decouvrir",
          label: dico.shell.journeys.decouvrir,
          items: [desktopHome],
        });
    }
    if (me?.isAdmin) {
      out.push({
        id: "staff",
        label: dico.shell.staff,
        icon: <Cadenas size={18} />,
        items: [
          { href: "/admin/dashboard", label: dico.nav.admin },
          ...staff.map((item) => translate(item)),
        ],
      });
    }
    return out;
  }, [journeys, staff, me, dico, rubrique, desktop]);

  const tabs = useMemo<ShellNavItem[]>(
    () =>
      MOBILE_PRIMARY_DESTINATIONS.map((destination) => {
        const href = desktop && destination.href === "/" ? "/desktop" : destination.href;
        const label =
          href === "/desktop"
            ? dico.shell.desktop
            : rubrique(href, { label: destination.label }).label;
        return { href, label, ...TAB_ICONS[href] };
      }),
    [desktop, dico, rubrique],
  );

  return (
    <AppShell
      pathname={pathname}
      brand={{
        href: desktop ? "/desktop" : "/",
        label: dico.shell.brandLabel,
        mark: <KintoUn hauteur={22} decorative />,
        name: "Dragon Ball",
        tagline: "France",
      }}
      sections={sections}
      tabs={tabs}
      labels={labels}
      linkComponent={NavLink}
      actions={<LanguageSwitcher variant="compact" />}
      account={<NavAuth variant="sidebar" />}
      mobileAccount={<NavAuth variant="compact" />}
      sheetFooter={<NavAuth variant="sheet" />}
      footer={footer}
      onCommandIntent={() => setArmed(true)}
      renderCommand={({ open, onOpenChange }) => (
        <CommandMenu open={open} onOpenChange={onOpenChange} armed={armed} />
      )}
    >
      {children}
    </AppShell>
  );
}
