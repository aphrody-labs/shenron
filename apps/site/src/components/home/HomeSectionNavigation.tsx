// SPDX-License-Identifier: Apache-2.0
"use client";
import { useMemo } from "react";
import { SectionNavigation, type PageSectionLink } from "@shenron/ui/public/SectionNavigation";
import { useT } from "@/components/T";
import { useHomeLiveState } from "./HomeLive";

export function HomeSectionNavigation({ sections }: { sections: readonly PageSectionLink[] }) {
  const t = useT();
  const { personas } = useHomeLiveState();
  const links = useMemo(
    () => [
      { id: "hero", label: t("home.sections.home") },
      ...sections
        .filter((section) => section.id !== "guardians" || personas.length > 0)
        .map((section) =>
          Object.assign({}, section, {
            label:
              section.label ||
              t(
                section.id === "universe"
                  ? "accueil.quick.title"
                  : section.id === "community"
                    ? "accueil.live.title"
                    : section.id === "pantheon"
                      ? "profile.leaderboard"
                      : "home.sections.fallback",
              ),
          }),
        ),
      { id: "jeux", label: t("accueil.games.title") },
    ],
    [sections, t, personas.length],
  );
  return <SectionNavigation sections={links} label={t("home.sections.pageSections")} />;
}
