"use client";

import Link from "next/link";
import { steamLaunchUrl, steamStoreUrl } from "@aphrody/shenron-config/public-urls";
import { useLangue } from "@/lib/i18n/client";
import {
  gameRuntimeMessages,
  XENOVERSE_2_GAME_PATH,
  XENOVERSE_2_STEAM_APP_ID,
} from "@/lib/game-runtime";

export function Xenoverse2Runtime({ wiki = false }: { wiki?: boolean }) {
  const { locale } = useLangue();
  const messages = gameRuntimeMessages(locale);
  const launchHref = steamLaunchUrl(XENOVERSE_2_STEAM_APP_ID);
  const storeHref = steamStoreUrl(XENOVERSE_2_STEAM_APP_ID);

  return (
    <section className="mb-8 space-y-5 rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold tracking-wide text-white">
          {messages.title}
        </h2>
        <span className="rounded-full border border-dbz-orange/30 bg-dbz-orange/10 px-3 py-1 font-mono text-xs font-semibold text-dbz-orange">
          Steam App ID: {XENOVERSE_2_STEAM_APP_ID}
        </span>
      </div>

      <p className="max-w-prose text-sm leading-relaxed text-white/70">{messages.description}</p>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-3">
        <a
          href={launchHref}
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-dbz-orange px-5 py-2.5 font-display text-sm font-bold text-black transition-transform hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-dbz-orange"
        >
          {messages.stream}
        </a>

        <a
          href={storeHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-white/20 bg-white/5 px-5 py-2.5 font-display text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
        >
          Page Boutique Steam
        </a>
      </div>

      {/* SteamCMD automation snippet */}
      <div className="rounded-xl border border-white/5 bg-black/40 p-4 font-mono text-xs">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/50">
          Commande de synchronisation headless SteamCMD
        </div>
        <code className="text-amber-300">
          steamcmd +login anonymous +app_update {XENOVERSE_2_STEAM_APP_ID} validate +quit
        </code>
      </div>

      {wiki ? (
        <p className="pt-2">
          <Link
            href={XENOVERSE_2_GAME_PATH}
            className="inline-flex items-center text-sm font-medium text-dbz-orange hover:underline underline-offset-4"
          >
            {messages.details} &rarr;
          </Link>
        </p>
      ) : (
        <div className="space-y-2 border-t border-white/10 pt-4">
          <h3 className="font-display text-base font-semibold text-white">{messages.wasm}</h3>
          <p className="max-w-prose text-sm text-white/70">{messages.wasmDescription}</p>
        </div>
      )}
    </section>
  );
}
