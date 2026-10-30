import { requireAdmin } from "@/lib/session";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { QueryProvider } from "@aphrody/shenron-ui/admin/QueryProvider";
import { AdminWorkspace } from "@/components/admin/AdminWorkspace";
import type { Metadata } from "next";

// L'espace admin n'est pas indexable par les moteurs de recherche
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "Administration · Dragon Ball France",
    template: "%s · Admin DBFR",
  },
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Vérifie que l'utilisateur est bien admin — redirige sinon
  await requireAdmin();

  // La navigation admin est celle du shell (barre latérale et feuille mobile) : `AdminSidebar`
  // la lui confie le temps que l'on reste sous /admin. Le contenu garde la largeur pleine.
  return (
    <QueryProvider>
      <AdminSidebar />
      <AdminWorkspace>{children}</AdminWorkspace>
    </QueryProvider>
  );
}
