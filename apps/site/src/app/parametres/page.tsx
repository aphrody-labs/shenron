import { requireUser } from "@/lib/session";
import AccountSettings from "./AccountSettings";
import { UserNav } from "@/components/user/UserNav";
import { PageShell } from "@shenron/ui/layout/PageShell";

export const dynamic = "force-dynamic";
// Page strictement personnelle (sessions, export, suppression) : comme
// `/dashboard`, `/favoris` et `/profil/[id]`, elle ne doit pas être indexée.
export const metadata = { title: "Paramètres", robots: { index: false, follow: false } };

export default async function ParametresPage() {
  const me = await requireUser("/parametres");
  return (
    <PageShell width="narrow" rhythm="tight">
      <div>
        <UserNav />
        <AccountSettings
          initial={{
            name: me.user?.username ?? "",
            image: me.user?.avatar ?? "",
            discordId: me.discordId,
          }}
        />
      </div>
    </PageShell>
  );
}
