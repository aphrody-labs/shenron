// SPDX-License-Identifier: Apache-2.0
"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  AppShell,
  SHELL_LABELS_FR,
  type ShellNavItem,
  type ShellNavSection,
} from "@aphrody/shenron-ui/navigation/AppShell";
import { DragonRadar, Maison, PlancheManga, Curseurs } from "@aphrody/shenron-ui/icones";
import { useLangue } from "@/lib/i18n/client";

function StudioLink({ href, children, ...props }: React.ComponentProps<typeof Link>) {
  return (
    <Link href={href} prefetch={false} {...props}>
      {children}
    </Link>
  );
}

export function DesktopStudioShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("desktop");
  const { dico } = useLangue();
  const items: ShellNavItem[] = [
    { href: "/studio", label: t("tools.studioTitle"), icon: <PlancheManga size={18} /> },
    { href: "/desktop", label: t("tools.siteText"), icon: <Maison size={18} /> },
    { href: "/desktop/control", label: t("tools.controlTitle"), icon: <DragonRadar size={18} /> },
    { href: "/settings", label: dico.common.settings, icon: <Curseurs size={18} /> },
  ];
  const sections: ShellNavSection[] = [
    { id: "studio", label: t("tools.studioTitle"), icon: <PlancheManga size={18} />, items },
  ];
  return (
    <AppShell
      pathname="/studio"
      tauri
      brand={{
        href: "/studio",
        label: "Shenron Studio",
        mark: <PlancheManga size={22} />,
        name: "Shenron Studio",
      }}
      sections={sections}
      tabs={items.slice(0, 3)}
      labels={{ ...SHELL_LABELS_FR, sidebar: "Navigation Studio", primaryNav: "Navigation Studio" }}
      linkComponent={StudioLink}
    >
      {children}
    </AppShell>
  );
}
