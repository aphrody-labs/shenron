"use client";
// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { useT } from "@/components/T";

export default function CatalogError({ reset }: { reset: () => void }) {
  const t = useT();
  return (
    <section className="mx-auto my-8 max-w-3xl rounded-xl border border-white/15 bg-dbz-card/80 p-6">
      <h2 role="alert" className="font-display text-xl">
        {t("catalog.unavailable")}
      </h2>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" className="dbz-button" onClick={reset}>
          {t("catalog.refresh")}
        </button>
        <Link href="/catalog" className="btn">
          {t("catalog.title")}
        </Link>
      </div>
    </section>
  );
}
