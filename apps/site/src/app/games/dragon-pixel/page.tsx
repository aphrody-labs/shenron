// SPDX-License-Identifier: Apache-2.0
import CpkScene from "./CpkScene";
import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import fr from "../../../../messages/dragon-pixel-scene/fr.json";
import en from "../../../../messages/dragon-pixel-scene/en.json";
import ja from "../../../../messages/dragon-pixel-scene/ja.json";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const text = locale === "en" ? en : locale === "ja" ? ja : fr;
  return {
    title: text.title,
    description: text.description,
    alternates: { canonical: "/games/dragon-pixel" },
  };
}

export default function PageDragonPixel() {
  return (
    <main className="min-h-screen bg-slate-950">
      <CpkScene />
    </main>
  );
}
