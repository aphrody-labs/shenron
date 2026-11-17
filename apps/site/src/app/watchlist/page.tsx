import { PageShell } from "@/components/kit";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@aphrody/shenron-ui/layout/PageHeader";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { WatchlistClient } from "./WatchlistClient";
import { UserNav } from "@/components/user/UserNav";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("watchlistPage");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    robots: { index: false, follow: false },
  };
}

/**
 * `/watchlist` : coquille statique (ni cookie ni session lus au rendu, pour rester
 * cachée par le CDN) ; la liste personnelle arrive à l'hydratation.
 */
export default async function WatchlistPage() {
  const t = await getTranslations("watchlistPage");
  return (
    <PageShell width="default">
      <UserNav />
      <Breadcrumbs className="mb-8" items={[{ label: t("title") }]} />
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        className="mb-10"
        subtitle={t("subtitle")}
      />
      <WatchlistClient />
    </PageShell>
  );
}
