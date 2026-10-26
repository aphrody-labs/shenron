"use client";
// SPDX-License-Identifier: Apache-2.0
import { useTechniqueText } from "@/lib/technique-ui-text";

export function TechniqueCatalogueHeading({ count }: { count: number }) {
  const t = useTechniqueText();
  return (
    <header className="space-y-3">
      <h1 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
        {t("title")}
      </h1>
      <p className="max-w-2xl text-base leading-relaxed text-white/65">{t("lead", { count })}</p>
    </header>
  );
}
