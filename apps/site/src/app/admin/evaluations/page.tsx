import type { Metadata } from "next";
import { redirectToAdminAi } from "@/components/admin/admin-ai-redirect";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Évaluations RAG & Bancs Dorés — Cockpit Unifié",
};

export default function AdminEvaluationsPage() {
  redirectToAdminAi("training");
}
