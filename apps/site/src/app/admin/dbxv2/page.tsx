/* oxlint-disable jsx-a11y/prefer-tag-over-role -- reviewed: admin-only private tooling, behavior preserved */
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale } from "next-intl/server";
import { requireAdmin } from "@/lib/session";
import { dbxv2SiteGate } from "@/lib/dbxv2-gate";
import { Dbxv2SiteError, getDbxv2Service } from "@/lib/dbxv2";
import { dbxv2Locale, dbxv2Text } from "@/lib/dbxv2-text";
import { Explorer } from "./Explorer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Immersion",
  robots: { index: false, follow: false, nocache: true },
};

/** Private explorer. The proxy already gates `/admin`; the session is checked again here. */
export default async function AdminDbxv2Page() {
  await requireAdmin();
  const locale = dbxv2Locale(await getLocale());
  const text = dbxv2Text(locale);

  const gate = dbxv2SiteGate();
  let reason: "public" | "production" | "unconfigured" | "unavailable" | null = gate.enabled
    ? null
    : gate.reason;
  let stats = { files: 0, characters: 0, messages: 0 };
  if (!reason) {
    try {
      stats = (await getDbxv2Service()).stats();
    } catch (error) {
      reason =
        error instanceof Dbxv2SiteError && error.code === "disabled"
          ? "unconfigured"
          : "unavailable";
    }
  }

  return (
    <main className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold">{text.title}</h1>
      <p>{text.lede}</p>
      {reason ? (
        <section role="status" className="my-6">
          <h2 className="text-lg font-semibold">{text.disabled.title}</h2>
          <p>{text.disabled[reason]}</p>
        </section>
      ) : (
        <>
          <p className="my-2">
            <Link href="/admin/dbxv2/immersion" className="underline">
              {text.tabs.immersion}
            </Link>
          </p>
          <Explorer locale={locale} messages={text} stats={stats} />
        </>
      )}
    </main>
  );
}
