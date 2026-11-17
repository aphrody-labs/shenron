import type { Metadata } from "next";
import { PageHeader } from "@aphrody/shenron-ui/layout/PageHeader";
import { PageShell } from "@aphrody/shenron-ui/layout/PageShell";
import { T } from "@/components/T";
import { DonationsClientView } from "@/components/stripe/DonationsClientView";
import { getReferenceTranslations } from "@/lib/i18n/reference";

/** Metadata stays in the reference language, like the cached HTML (see `components/T.tsx`). */
export function generateMetadata(): Metadata {
  const t = getReferenceTranslations("billing.donations");
  return {
    title: t("title"),
    description: t("metaDescription"),
    alternates: { canonical: "/donations" },
  };
}

export default function DonationsPage() {
  return (
    <PageShell width="narrow">
      <PageHeader
        title={<T k="billing.donations.title" />}
        subtitle={<T k="billing.donations.description" />}
        className="mb-6"
      />
      <DonationsClientView />
    </PageShell>
  );
}
