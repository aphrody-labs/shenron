"use client";

// SPDX-License-Identifier: Apache-2.0
/**
 * Onglets de l'espace membre. Les libellés viennent du dictionnaire (`userNav.*`).
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TabNav } from "@aphrody/shenron-ui/navigation/TabNav";
import { useT } from "@/components/T";

const ITEMS = [
  { href: "/dashboard", key: "userNav.overview" },
  { href: "/watchlist", key: "userNav.watchlist" },
  { href: "/favorites", key: "userNav.favorites" },
  { href: "/profile/me", key: "userNav.publicProfile" },
  { href: "/tierlists/mine", key: "userNav.tierlists" },
  { href: "/account/billing", key: "userNav.billing" },
  { href: "/settings", key: "userNav.settings" },
] as const;

export function UserNav() {
  const t = useT();
  const pathname = usePathname() ?? "/";
  const active = pathname.startsWith("/profile/")
    ? "/profile/me"
    : (ITEMS.find((item) => item.href === pathname)?.href ?? "");
  return (
    <TabNav
      items={ITEMS.map((item) => ({ href: item.href, label: t(item.key) }))}
      active={active}
      ariaLabel={t("userNav.ariaLabel")}
      className="mb-8"
      linkComponent={Link}
    />
  );
}
