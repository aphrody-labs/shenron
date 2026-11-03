import { dbUniverse } from "@/lib/db-universe";
import { WishesLedger } from "@/components/wiki/WishesLedger";
import { WikiIndexPage } from "@/components/wiki/WikiIndexPage";
import { ogMeta } from "@/lib/og";
import { getLaunchConfig } from "@/lib/wiki-launch-config";
import type { Metadata } from "next";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Dragons Sacrés & Registre des Vœux Dragon Ball",
  description:
    "Shenron, Polunga, Super Shenron, Toronbo et Ultimate Shenron. Règles divines, formules d'invocation et historique complet de chaque vœu canonique exaucé.",
  ...ogMeta({
    title: "Dragons Sacrés & Registre des Vœux — DBFR",
    description:
      "L'annuaire des dragons divins et tous les vœux exaucés dans Dragon Ball : culotte d'Oolong, résurrections, téléportations et Super Dragon Balls.",
    canonical: "/wiki/dragons",
    type: "website",
  }),
};

export default async function DragonsPage() {
  const [dragons, wishes, launch] = await Promise.all([
    dbUniverse.dragons(),
    dbUniverse.wishes(),
    getLaunchConfig().catch(() => null),
  ]);
  const access = launch ? { openKeys: launch.openKeys, access: launch.access } : null;
  const artwork = dragons?.find((dragon) => dragon.image);

  return (
    <WikiIndexPage
      eyebrow="Encyclopédie"
      title="Dragons Sacrés & Registre des Vœux"
      lead={`Les 5 dragons divins du multivers et l'inventaire historique de ${wishes?.length ?? 0} vœux canoniques exaucés — règles, formules sacrées en dialecte divin et répercussions universelles.`}
      image={artwork?.image ?? undefined}
      imageAlt={artwork?.name}
      crumbs={[{ label: "Dragons & Vœux" }]}
      category="dragons"
      contributeKey="kit.contribute.what.dragon"
    >
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-xs leading-relaxed text-amber-200/80">
        <strong>Loi sacrée des Dragon Balls :</strong> Créées à l'origine par les membres du Clan du
        Dragon namekien et par le Dieu Dragon Zalama, les perles sacrées sont régies par des règles
        inaltérables. Aucun dragon ne peut accomplir un prodige surpassant la puissance spirituelle
        de son propre créateur.
      </div>

      <WishesLedger dragons={dragons ?? []} wishes={wishes ?? []} access={access} />
    </WikiIndexPage>
  );
}
