import type { Metadata } from "next";
import { redirectToAdminAi } from "@/components/admin/admin-ai-redirect";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Doctrine de Canonicité & Paroles de Toriyama — Cockpit Unifié",
};

export default function AdminCanonPage() {
  redirectToAdminAi("canon");
}
