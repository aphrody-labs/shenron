"use client";

// SPDX-License-Identifier: Apache-2.0
/**
 * Onglets de l'espace membre avec intégration directe de la Watchlist.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TabNav } from "@aphrody/shenron-ui/navigation/TabNav";

const ITEMS = [
  { href: "/dashboard", label: "Vue d’ensemble" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/favorites", label: "Favoris" },
  { href: "/profile/me", label: "Profil public" },
  { href: "/tierlists/mine", label: "Mes tier lists" },
  { href: "/account/billing", label: "Abonnements & paiements" },
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
