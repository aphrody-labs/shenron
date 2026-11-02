import { redirect } from "next/navigation";
import { T } from "@/components/T";
import { PageShell } from "@aphrody/shenron-ui/layout/PageShell";
import { getSessionUser } from "@/lib/session";
import ConsentForm from "./ConsentForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Autorisation OAuth", robots: { index: false, follow: false } };

export default async function OAuthConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const me = await getSessionUser();
  if (!me) {
    const serialized = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (typeof value === "string") serialized.set(key, value);
      else if (Array.isArray(value)) for (const item of value) serialized.append(key, item);
    }
    const callbackURL = `/oauth/consent${serialized.size ? `?${serialized.toString()}` : ""}`;
    redirect(`/signin?callbackURL=${encodeURIComponent(callbackURL)}`);
  }
  const clientId = typeof query.client_id === "string" ? query.client_id : "";
  const scopes = typeof query.scope === "string" ? query.scope.split(" ").filter(Boolean) : [];
  return (
    <PageShell rhythm="tight">
      <section className="mx-auto my-14 w-full max-w-xl rounded-2xl border border-white/10 bg-black/30 p-7 text-white md:p-10">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-dbz-orange">
          <T k="auth.consent.eyebrow" />
        </p>
        <ConsentForm clientId={clientId} scopes={scopes} />
      </section>
    </PageShell>
  );
}
