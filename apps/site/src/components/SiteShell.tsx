// SPDX-License-Identifier: Apache-2.0
/**
 * SiteShell — la coque de toutes les pages du site (et de la fenêtre de bureau).
 *
 * Côté serveur, elle ne fait qu'une chose : dériver la navigation PUBLIQUE de la carte du
 * site (`lib/shell-nav.ts`, depuis `lib/site-map.ts` et le registre d'accès) filtrée par la
 * configuration de lancement — ce qu'on affiche est exactement ce qu'un clic obtient. Aucune
 * session ici : le layout reste cacheable ; l'espace membre est filtré côté client, après
 * `/api/me`. L'administration n'y figure jamais : elle a sa propre navigation
 * (`AdminSidebar`, montée par `app/admin/layout.tsx`).
 */
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteShellClient } from "@/components/SiteShellClient";
import { publicShellJourneys } from "@/lib/shell-nav";
import { getLaunchConfig } from "@/lib/wiki-launch-config";

export async function SiteShell({ children }: { children: ReactNode }) {
  const cfg = await getLaunchConfig().catch(() => null);
  return (
    <SiteShellClient journeys={publicShellJourneys(cfg)} footer={<SiteFooter />}>
      {children}
    </SiteShellClient>
  );
}
