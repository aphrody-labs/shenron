import type { Metadata } from "next";
import { requireAdmin } from "@/lib/session";
import { AdminPageHeading } from "@/components/admin/admin-ui";
import { MonetizationDashboard } from "./MonetizationDashboard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Monétisation" };

export default async function MonetizationPage() {
  await requireAdmin();
  return (
    <main className="space-y-6 p-4 sm:p-6">
      <AdminPageHeading page="monetization" />
      <MonetizationDashboard />
    </main>
  );
}
