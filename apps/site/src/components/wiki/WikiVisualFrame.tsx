"use client";

// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { wikiVisualSection, wikiVisualTopic } from "@/lib/wiki-visual-theme";
import styles from "./wiki-editorial.module.css";

/** Only the backdrop belongs to the route frame; readers and players keep their own layouts. */
export function WikiVisualFrame({ children }: { children: ReactNode }) {
  const section = wikiVisualSection(usePathname());
  return (
    <div
      data-wiki-surface
      data-wiki-section={section ?? undefined}
      data-wiki-topic={section ? wikiVisualTopic(section) : undefined}
      className={section ? styles.surface : undefined}
    >
      {children}
    </div>
  );
}
