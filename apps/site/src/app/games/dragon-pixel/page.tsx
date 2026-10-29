// SPDX-License-Identifier: Apache-2.0
import DragonWorld from "@/components/dragon-world/DragonWorld";
import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import fr from "../../../../messages/dragon-world/fr.json";
import en from "../../../../messages/dragon-world/en.json";
import ja from "../../../../messages/dragon-world/ja.json";
import { GAME_URL } from "@/lib/config";
import { env } from "@/lib/env";
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const text = locale === "en" ? en : locale === "ja" ? ja : fr;
  return {
    title: text.title,
    description: text.subtitle,
    alternates: { canonical: GAME_URL },
  };
}

export default function PageDragonPixel() {
  return (
    <main className="min-h-screen bg-slate-950">
      <DragonWorld standalone={env.SHENRON_SITE_SURFACE === "game"} />
    </main>
  );
}
