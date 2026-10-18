"use client";

import Link from "next/link";
import { bunOsPlayUrl } from "@aphrody/shenron-config/public-urls";
import { useLangue } from "@/lib/i18n/client";
import {
  gameRuntimeMessages,
  XENOVERSE_2_GAME_PATH,
  XENOVERSE_2_STEAM_APP_ID,
} from "@/lib/game-runtime";

export function Xenoverse2Runtime({ wiki = false }: { wiki?: boolean }) {
  const { locale } = useLangue();
  const messages = gameRuntimeMessages(locale);
  return (
    <section className="mb-8 space-y-4 rounded-xl border border-white/10 p-5 sm:p-6">
      <h2 className="font-display text-xl font-semibold">{messages.title}</h2>
      <p className="max-w-prose text-sm text-white/70">{messages.description}</p>
      <a
        href={bunOsPlayUrl(XENOVERSE_2_STEAM_APP_ID)}
        rel="noreferrer"
        className="inline-flex min-h-11 items-center rounded-lg bg-dbz-orange px-4 py-2 font-semibold text-black focus-visible:outline-2 focus-visible:outline-offset-4"
      >
        {messages.stream}
      </a>
      {wiki ? (
        <p>
          <Link href={XENOVERSE_2_GAME_PATH} className="underline underline-offset-4">
            {messages.details}
          </Link>
        </p>
      ) : (
        <div className="space-y-2 border-t border-white/10 pt-4">
          <h3 className="font-semibold">{messages.wasm}</h3>
          <p className="max-w-prose text-sm text-white/70">{messages.wasmDescription}</p>
        </div>
      )}
    </section>
  );
}
