"use client";
// SPDX-License-Identifier: Apache-2.0
import Image from "next/image";
import { createTranslator } from "next-intl";
import { useLangue } from "@/lib/i18n/client";
import { WikiImg } from "./WikiImg";
import { assetUrl } from "@/lib/assets";
import type { TechniqueArtwork } from "@/lib/technique-artwork";
import fr from "../../../messages/technique-artwork/fr.json";
import en from "../../../messages/technique-artwork/en.json";
import ja from "../../../messages/technique-artwork/ja.json";

/** Only measured, reviewed attack artwork reaches this panel. */
export function TechniqueArtworkPanel({
  name,
  artwork,
}: {
  name: string;
  artwork: TechniqueArtwork | null;
}) {
  const { locale } = useLangue();
  const t = createTranslator({ locale, messages: { fr, en, ja }[locale] });
  return (
    <section aria-label={t("heading")} className="border-b-2 border-black bg-black">
      {artwork ? (
        <figure>
          <div className="relative aspect-[4/3] w-full overflow-hidden">
            <WikiImg
              src={artwork.image}
              alt={name}
              sizes="(max-width: 1024px) 100vw, 380px"
              className="object-contain"
            />
          </div>
          <figcaption className="flex items-center gap-3 border-t border-white/10 p-4 text-xs text-white/65">
            {artwork.icon && (
              <Image
                src={assetUrl(artwork.icon)}
                alt={t("icon", { name })}
                width={40}
                height={40}
                unoptimized
                className="shrink-0"
              />
            )}
            {artwork.source ? (
              <a
                href={artwork.source.url}
                className="min-w-0 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-dbz-orange"
              >
                <span className="block font-semibold text-white">{t(artwork.medium)}</span>
                <span className="block">{artwork.source.label}</span>
                {artwork.source.provenance === "dbfc-colorization" && (
                  <span className="block">{t("dbfcProvenance")}</span>
                )}
                <span className="sr-only"> · {t("reference")}</span>
              </a>
            ) : (
              <span>{t("editorial")}</span>
            )}
          </figcaption>
        </figure>
      ) : (
        <p className="p-5 text-sm leading-relaxed text-white/60">{t("pending")}</p>
      )}
    </section>
  );
}
