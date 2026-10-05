import type { Metadata } from "next";
import { QueryProvider } from "@/components/admin/QueryProvider";
import { requireAdmin } from "@/lib/session";

/**
 * Outils staff de l'atelier (transcription, traduction, relecture d'un ouvrage), sortis de
 * `/admin` pour vivre à côté des pages publiques qu'ils alimentent.
 *
 * L'accès est arbitré AVANT le rendu par `proxy.ts` (`WORKSHOP_STAFF_PREFIXES`) : sous le
 * streaming de Next 16, la redirection d'un layout n'empêche pas les pages d'émettre leur
 * charge utile. `requireAdmin()` reste ici et dans chaque page, en défense en profondeur.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

export default async function WorkshopStaffLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <QueryProvider>{children}</QueryProvider>;
}
