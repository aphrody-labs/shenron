"use client";
// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { useLangue } from "@/lib/i18n/client";
import fr from "../../../messages/games-hub/fr.json";
import en from "../../../messages/games-hub/en.json";
import ja from "../../../messages/games-hub/ja.json";

const dictionaries = { fr, en, ja };

/** Entry to the Budokai Tenkaichi 3 player, which runs the Gecko emulator with the visitor's own disc image. */
export function TenkaichiLaunchCard() {
  const { locale } = useLangue();
  const { bt3 } = dictionaries[locale];
  return (
    <section
      aria-labelledby="tenkaichi-play"
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"
    >
      <h2 id="tenkaichi-play" className="font-display text-xl font-bold text-white">
        {bt3.name}
      </h2>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-white/70">{bt3.description}</p>
      <Link
        href="/games/budokai-tenkaichi-3"
        className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-dbz-orange px-5 py-2.5 font-display text-sm font-bold text-black"
      >
        {bt3.action}
      </Link>
    </section>
  );
}
