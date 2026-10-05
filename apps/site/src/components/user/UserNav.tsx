"use client";

/**
 * Onglets de l'espace membre. Même barre d'onglets en liens que le reste du site
 * (`@shenron/ui/navigation/TabNav`) : chaque onglet est une URL, le retour arrière fait ce
 * qu'on attend, et la navigation globale reste au shell.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TabNav } from "@shenron/ui/navigation/TabNav";

const ITEMS = [
  { href: "/dashboard", label: "Vue d’ensemble" },
  { href: "/profil/me", label: "Profil public" },
  { href: "/favoris", label: "Favoris" },
  { href: "/tierlists/mes", label: "Mes tier lists" },
  { href: "/parametres", label: "Paramètres" },
] as const;

export function UserNav() {
  const pathname = usePathname() ?? "/";
  const active = pathname.startsWith("/profil/")
    ? "/profil/me"
    : (ITEMS.find((item) => item.href === pathname)?.href ?? "");
  return (
    <TabNav
      items={ITEMS}
      active={active}
      ariaLabel="Espace membre"
      className="mb-8"
      linkComponent={Link}
    />
  );
}
