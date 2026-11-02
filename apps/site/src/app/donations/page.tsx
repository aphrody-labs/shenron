import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@aphrody/shenron-ui/layout/PageHeader";
import { PageShell } from "@aphrody/shenron-ui/layout/PageShell";
import { T } from "@/components/T";
import { DonationsClientView } from "@/components/stripe/DonationsClientView";

/** Metadata stays in the reference language, like the cached HTML (see `components/T.tsx`). */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: "fr", namespace: "billing.donations" });
  return { title: t("title"), description: t("metaDescription") };
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
