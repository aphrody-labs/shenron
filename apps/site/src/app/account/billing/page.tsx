import { eq } from "drizzle-orm";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { PageHeader } from "@aphrody/shenron-ui/layout/PageHeader";
import { PageShell } from "@aphrody/shenron-ui/layout/PageShell";
import { UserNav } from "@/components/user/UserNav";
import { db } from "@/lib/db";
import { baSubscription, sitePaypalSubscriptions, siteDonations } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { BillingActions } from "./BillingActions";

export const dynamic = "force-dynamic";
// Personal page, like /dashboard and /settings: never indexed.
export const metadata = {
  title: "Abonnement et paiements",
  robots: { index: false, follow: false },
};

const DONATION_STATUSES = ["succeeded", "pending", "failed", "disputed"] as const;
const LINK =
  "inline-flex min-h-11 items-center text-sm text-white/80 underline underline-offset-4 hover:text-dbz-yellow";

export default async function BillingPage() {
  const user = await getCurrentUser();
  if (!user?.sessionUserId || user.sessionUserId === "token-admin") {
    redirect("/signin?callbackURL=%2Faccount%2Fbilling");
  }
  const [t, locale] = await Promise.all([getTranslations("billing"), getLocale()]);
  const [stripeSubscriptions, paypalSubscriptions, donations] = await Promise.all([
    db
      .select({
        id: baSubscription.id,
        plan: baSubscription.plan,
        status: baSubscription.status,
        periodEnd: baSubscription.periodEnd,
        cancelAtPeriodEnd: baSubscription.cancelAtPeriodEnd,
      })
      .from(baSubscription)
      .where(eq(baSubscription.referenceId, user.sessionUserId)),
    db
      .select({
        id: sitePaypalSubscriptions.paypalSubscriptionId,
        plan: sitePaypalSubscriptions.plan,
        status: sitePaypalSubscriptions.status,
        nextBillingAt: sitePaypalSubscriptions.nextBillingAt,
      })
      .from(sitePaypalSubscriptions)
      .where(eq(sitePaypalSubscriptions.userId, user.sessionUserId)),
    db
      .select({
        id: siteDonations.id,
        amount: siteDonations.amount,
        currency: siteDonations.currency,
        status: siteDonations.status,
        createdAt: siteDonations.createdAt,
      })
      .from(siteDonations)
      .where(eq(siteDonations.userId, user.sessionUserId)),
  ]);
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const money = (amount: number, currency: string) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: currency.toUpperCase() }).format(
      amount / 100,
    );
  const donationStatus = (status: string) =>
    (DONATION_STATUSES as readonly string[]).includes(status)
      ? t(`donationStatus.${status as (typeof DONATION_STATUSES)[number]}`)
      : t("donationStatus.other");

  return (
    <PageShell rhythm="tight">
      <UserNav />
      <PageHeader title={t("accountTitle")} subtitle={t("accountDescription")} className="mb-8" />

      <section aria-labelledby="billing-subscriptions">
        <h2 id="billing-subscriptions" className="mb-4 font-display text-xl font-bold text-white">
          {t("subscriptionsTitle")}
        </h2>
        <BillingActions
          stripeSubscriptions={stripeSubscriptions}
          paypalSubscriptions={paypalSubscriptions}
        />
      </section>

      <section aria-labelledby="billing-donations" className="mt-10">
        <h2 id="billing-donations" className="mb-4 font-display text-xl font-bold text-white">
          {t("donationHistory")}
        </h2>
        {donations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-dbz-border p-5">
            <p className="text-[0.9375rem] text-white/80">{t("noDonations")}</p>
            <Link
              href="/donations"
              className="mt-3 inline-flex min-h-11 items-center font-semibold text-dbz-orange underline underline-offset-4 hover:text-dbz-yellow"
            >
              {t("donationsLink")}
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-dbz-border bg-dbz-card">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-dbz-border text-white/75">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t("donationDate")}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    {t("donationAmount")}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t("donationState")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dbz-border text-white">
                {donations
                  .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
                  .map((donation) => (
                    <tr key={donation.id}>
                      <td className="px-4 py-3">
                        <time dateTime={donation.createdAt.toISOString()}>
                          {dateFormat.format(donation.createdAt)}
                        </time>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {money(donation.amount, donation.currency)}
                      </td>
                      <td className="px-4 py-3">{donationStatus(donation.status)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <nav aria-labelledby="billing-more" className="mt-8 flex flex-wrap gap-x-6">
        <span id="billing-more" className="sr-only">
          {t("accountTitle")}
        </span>
        <Link href="/vip" className={LINK}>
          {t("vipLink")}
        </Link>
        <Link href="/donations" className={LINK}>
          {t("donationsLink")}
        </Link>
      </nav>
    </PageShell>
  );
}
