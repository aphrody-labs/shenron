import { eq } from "drizzle-orm";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { UserNav } from "@/components/user/UserNav";
import { db } from "@/lib/db";
import { baSubscription, sitePaypalSubscriptions, siteDonations } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { BillingActions } from "./BillingActions";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const user = await getCurrentUser();
  if (!user?.sessionUserId || user.sessionUserId === "token-admin") {
    redirect("/signin?callbackURL=%2Faccount%2Fbilling");
  }
  const t = await getTranslations("billing");
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
  return (
    <main className="mx-auto min-h-[70vh] w-full max-w-4xl px-4 py-12 text-white">
      <UserNav />
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t("accountTitle")}</h1>
          <p className="mt-2 text-sm text-white/65">{t("accountDescription")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
          <Link
            href="/vip"
            className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-3.5 py-2 text-amber-300 transition-colors hover:bg-amber-400/20"
          >
            {t("vipLink")}
          </Link>
          <Link
            href="/donations"
            className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-white/80 transition-colors hover:border-white/30 hover:text-white"
          >
            {t("donationsLink")}
          </Link>
        </div>
      </header>
      <BillingActions
        stripeSubscriptions={stripeSubscriptions}
        paypalSubscriptions={paypalSubscriptions}
        labels={{
          manageStripe: t("manageStripe"),
          cancelPaypal: t("cancelPaypal"),
          cancellationDone: t("cancellationDone"),
          actionError: t("actionError"),
          statusActive: t("statusActive"),
          statusTrialing: t("statusTrialing"),
          statusPastDue: t("statusPastDue"),
          statusCancelled: t("statusCancelled"),
          statusPending: t("statusPending"),
          statusOther: t("statusOther"),
        }}
      />
      <section className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-lg font-semibold">{t("donationHistory")}</h2>
        {donations.length === 0 ? (
          <p className="mt-3 text-sm text-white/55">{t("noDonations")}</p>
        ) : (
          <ul className="mt-4 divide-y divide-white/10">
            {donations.map((donation) => (
              <li key={donation.id} className="flex justify-between gap-4 py-3 text-sm">
                <span>{donation.createdAt.toLocaleDateString()}</span>
                <span>
                  {(donation.amount / 100).toFixed(2)} {donation.currency.toUpperCase()}
                </span>
                <span>{donation.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
