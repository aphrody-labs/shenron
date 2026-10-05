"use client";

import { TabNav } from "@/components/kit/TabNav";
import { useT } from "@/components/T";

export interface EditorialTab {
  href: string;
  /** Clé du dictionnaire : les libellés suivent la langue du lecteur. */
  labelKey: string;
}

/** Îlot client : `TabNav` attend des chaînes, la traduction se fait donc ici. */
export function EditorialTabsView({
  tabs,
  active,
  className,
}: {
  tabs: readonly EditorialTab[];
  active: string;
  className?: string;
}) {
  const t = useT();
  return (
    <TabNav
      ariaLabel={t("wiki.editorialNav.label")}
      active={active}
      className={className}
      items={tabs.map((tab) => ({ href: tab.href, label: t(tab.labelKey) }))}
    />
  );
}
