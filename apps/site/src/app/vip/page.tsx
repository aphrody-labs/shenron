import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@aphrody/shenron-ui/layout/PageHeader";
import { PageShell } from "@aphrody/shenron-ui/layout/PageShell";
import { T } from "@/components/T";
import { VipPricingCards } from "@/components/stripe/VipPricingCards";

/** Metadata stays in the reference language, like the cached HTML (see `components/T.tsx`). */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: "fr", namespace: "billing.vip" });
  return { title: t("title"), description: t("metaDescription") };
}

const LINK =
  "inline-flex min-h-11 items-center text-sm text-white/80 underline underline-offset-4 hover:text-dbz-yellow";

export default function VipPage() {
  return (
    <PageShell width="narrow">
      <PageHeader
        title={<T k="billing.vip.title" />}
        subtitle={<T k="billing.vip.description" />}
      />
      <VipPricingCards />
      <p className="mt-8 text-[0.9375rem] leading-relaxed text-white/80">
        <T k="billing.vip.note" />
      </p>
      <nav aria-labelledby="vip-more" className="mt-4 flex flex-wrap gap-x-6">
        <span id="vip-more" className="sr-only">
          <T k="billing.accountTitle" />
        </span>
        <Link href="/account/billing" className={LINK}>
          <T k="billing.accountBillingLink" />
        </Link>
        <Link href="/donations" className={LINK}>
          <T k="billing.donationsLink" />
        </Link>
      </nav>
    </PageShell>
  );
}
