import { requireUser } from "@/lib/session";
import AccountSettings from "./AccountSettings";
import { UserNav } from "@/components/user/UserNav";
import { T } from "@/components/T";
import { PageHeader } from "@shenron/ui/layout/PageHeader";
import { PageShell } from "@shenron/ui/layout/PageShell";
import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
// Page strictement personnelle (sessions, export, suppression) : comme
// `/dashboard`, `/favorites` et `/profile/[id]`, elle ne doit pas être indexée.
export const metadata = { title: "Paramètres", robots: { index: false, follow: false } };

export default async function ParametresPage({ searchParams }: { searchParams: Promise<{ steam?: string }> }) {
  const me = await requireUser("/settings");
  const query = await searchParams;
  const [steam] = await db.select({ accountId: schema.baAccount.accountId }).from(schema.baAccount)
    .where(and(eq(schema.baAccount.userId, me.sessionUserId), eq(schema.baAccount.providerId, "steam")))
    .limit(1);
  return (
    <PageShell rhythm="tight">
      <UserNav />
      <PageHeader
        eyebrow={<T k="settings.eyebrow" />}
        title={<T k="settings.title" />}
        subtitle={<T k="settings.lead" />}
        className="mb-8"
      />
      <AccountSettings
        initial={{
          name: me.user?.username ?? "",
          image: me.user?.avatar ?? "",
          discordId: me.discordId,
          steamId: steam?.accountId ?? null,
          steamError: query.steam === "error",
        }}
      />
    </PageShell>
  );
}
