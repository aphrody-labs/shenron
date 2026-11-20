"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useT } from "@/components/T";
import { browserReloadDeps, recoverFromChunkError } from "@/lib/chunk-reload";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();

  useEffect(() => {
    // A chunk of a former release, caught while rendering: reload once onto the current build.
    if (recoverFromChunkError(error, browserReloadDeps())) return;
    console.error(error);
  }, [error]);

  return (
    <div className="container mx-auto px-4 py-24 max-w-2xl text-center">
      <div className="dbz-panel p-12 border-l-4 border-fuchsia-500">
        <h1 className="title-jagged text-3xl md:text-5xl leading-tight mb-6">
          {t("common.error")}
        </h1>
        <p className="text-white/70 mb-2">{t("error.lead")}</p>
        {error.digest && (
          <p className="text-xs text-white/50 font-mono mb-6">
            {t("error.digest", { digest: error.digest })}
          </p>
        )}
        <div className="flex items-center justify-center gap-3 mt-6">
          <button type="button" onClick={() => reset()} className="dbz-button !text-xs">
            {t("error.retry")}
          </button>
          <Link href="/" className="dbz-button-ghost !text-xs">
            {t("shell.home")}
          </Link>
        </div>
      </div>
    </div>
  );
}
