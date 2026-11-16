import type { ReactNode } from "react";
import { PageHeader } from "@shenron/ui/layout/PageHeader";
import { PageShell } from "@shenron/ui/layout/PageShell";
import { requireUser } from "@/lib/session";

/**
 * Cadre des mini-jeux jouables contre le bot (pfc, morpion, bingo) : connexion
 * exigée (les parties débitent et créditent des Zénis), puis la colonne commune
 * du site — `PageShell` + `PageHeader` de `@shenron/ui`, aucune largeur ni
 * gouttière maison. La largeur `prose` garde le plateau à portée de pouce sur
 * mobile et centré sans s'étaler sur desktop.
 */
export async function GamePage({
  path,
  title,
  lead,
  children,
}: {
  /** Chemin de retour après connexion. */
  path: string;
  title: ReactNode;
  /** Chapô, qui interpelle le joueur par son pseudo. */
  lead: (username: string) => ReactNode;
  children: ReactNode;
}) {
  const me = await requireUser(path);
  return (
    <PageShell width="prose" rhythm="tight">
      <PageHeader
        title={title}
        size="md"
        className="mb-8"
        subtitle={lead(me.user?.username || "Guerrier")}
      />
      {children}
    </PageShell>
  );
}
