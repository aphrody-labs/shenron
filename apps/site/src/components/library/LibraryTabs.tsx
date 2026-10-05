"use client";

import { usePathname } from "next/navigation";
import { TabNav } from "@/components/kit/TabNav";
import { useT } from "@/components/T";
import { useMe } from "@/lib/use-me";
import { WORKSHOP_TABS, libraryTabFor, workshopTabFor, type LibraryTab } from "@/lib/library";

/**
 * Vue des onglets de la Bibliothèque. Îlot client : `TabNav` attend des chaînes traduites
 * et l'onglet courant se lit dans l'URL, ce qui garde cacheables les pages qui l'incluent.
 */
export function LibraryTabs({
  tabs,
  className,
}: {
  tabs: readonly LibraryTab[];
  className?: string;
}) {
  const t = useT();
  const pathname = usePathname() ?? "/";
  return (
    <TabNav
      ariaLabel={t("library.label")}
      active={libraryTabFor(pathname) ?? ""}
      className={className}
      items={tabs.map((tab) => ({ href: tab.href, label: t(tab.labelKey) }))}
    />
  );
}

/**
 * Sous-onglets de l'atelier. Les outils staff (transcription, traduction) n'apparaissent
 * qu'au staff, d'après `/api/me` ; le proxy et `requireAdmin()` arbitrent l'accès réel.
 */
export function WorkshopNav({ className = "mb-6" }: { className?: string }) {
  const t = useT();
  const me = useMe();
  const pathname = usePathname() ?? "/workshop";
  const tabs = WORKSHOP_TABS.filter((tab) => !tab.staff || me?.isAdmin);
  if (tabs.length < 2) return null;
  return (
    <TabNav
      ariaLabel={t("library.workshop.label")}
      active={workshopTabFor(pathname)}
      className={className}
      items={tabs.map((tab) => ({ href: tab.href, label: t(tab.labelKey) }))}
    />
  );
}
