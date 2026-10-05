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
  { href: "/profile/me", label: "Profil public" },
  { href: "/favorites", label: "Favoris" },
  { href: "/tierlists/mine", label: "Mes tier lists" },
  { href: "/settings", label: "Paramètres" },
] as const;

export function UserNav() {
  const pathname = usePathname() ?? "/";
  const active = pathname.startsWith("/profile/")
    ? "/profile/me"
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
