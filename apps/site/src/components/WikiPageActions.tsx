"use client";

import { usePathname } from "next/navigation";
import { DiscordInviteFAB } from "@/components/DiscordInviteFAB";
import { ReportButton } from "@/components/ReportButton";

export function WikiPageActions() {
  const pathname = usePathname();
  const wikiPage = pathname === "/wiki" || pathname?.startsWith("/wiki/");

  if (!wikiPage) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-3 border-t border-white/10 px-4 py-6">
      <DiscordInviteFAB inline />
      <ReportButton inline />
    </div>
  );
}
