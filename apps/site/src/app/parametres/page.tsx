import { requireUser } from "@/lib/session";
import AccountSettings from "./AccountSettings";
import { UserNav } from "@/components/user/UserNav";
import { T } from "@/components/T";
import { PageHeader } from "@shenron/ui/layout/PageHeader";
import { PageShell } from "@shenron/ui/layout/PageShell";

export const dynamic = "force-dynamic";
// Page strictement personnelle (sessions, export, suppression) : comme
// `/dashboard`, `/favoris` et `/profil/[id]`, elle ne doit pas être indexée.
export const metadata = { title: "Paramètres", robots: { index: false, follow: false } };

export default async function ParametresPage() {
  const me = await requireUser("/parametres");
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
        }}
      />
    </PageShell>
  );
}
