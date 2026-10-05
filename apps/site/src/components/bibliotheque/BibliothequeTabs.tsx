"use client";

import { usePathname } from "next/navigation";
import { TabNav } from "@/components/kit/TabNav";
import { useT } from "@/components/T";
import { useMe } from "@/lib/use-me";
import {
  ATELIER_TABS,
  atelierTabFor,
  bibliothequeTabFor,
  type BibliothequeTab,
} from "@/lib/bibliotheque";

/**
 * Vue des onglets de la Bibliothèque. Îlot client : `TabNav` attend des chaînes traduites
 * et l'onglet courant se lit dans l'URL, ce qui garde cacheables les pages qui l'incluent.
 */
export function BibliothequeTabs({
  tabs,
  className,
}: {
  tabs: readonly BibliothequeTab[];
  className?: string;
}) {
  const t = useT();
  const pathname = usePathname() ?? "/";
  return (
    <TabNav
      ariaLabel={t("bibliotheque.label")}
      active={bibliothequeTabFor(pathname) ?? ""}
      className={className}
      items={tabs.map((tab) => ({ href: tab.href, label: t(tab.labelKey) }))}
    />
  );
}

/**
 * Sous-onglets de l'atelier. Les outils staff (transcription, traduction) n'apparaissent
 * qu'au staff, d'après `/api/me` ; le proxy et `requireAdmin()` arbitrent l'accès réel.
 */
export function AtelierNav({ className = "mb-6" }: { className?: string }) {
  const t = useT();
  const me = useMe();
  const pathname = usePathname() ?? "/atelier";
  const tabs = ATELIER_TABS.filter((tab) => !tab.staff || me?.isAdmin);
  if (tabs.length < 2) return null;
  return (
    <TabNav
      ariaLabel={t("bibliotheque.atelier.label")}
      active={atelierTabFor(pathname)}
      className={className}
      items={tabs.map((tab) => ({ href: tab.href, label: t(tab.labelKey) }))}
    />
  );
}
