"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { CharacterVariant } from "@/lib/shenron";

type CharacterChoice = {
  id: number;
  name: string;
  slug: string;
  label?: string | null;
  isMain?: boolean;
  series?: string;
};

/** Selects an alternate character identity, then a saga-specific state. */
export function CharacterPageSelectors({
  character,
  versions,
  seriesChoices,
  previewChoices,
  variants,
  labels,
  selectedSagaSlug,
  selectedSeries,
  preview = false,
}: {
  character: CharacterChoice;
  versions: CharacterChoice[];
  seriesChoices: CharacterChoice[];
  previewChoices: CharacterChoice[];
  variants: CharacterVariant[];
  labels: {
    version: string;
    saga: string;
    main: string;
    choose: string;
    previewContentNotLinked: string;
  };
  selectedSagaSlug: string | null;
  selectedSeries: string | null;
  preview?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const choiceSet = preview
    ? previewChoices
    : [character, ...seriesChoices, ...versions.filter((choice) => !choice.isMain)];
  const choices = [...new Map(choiceSet.map((choice) => [choice.id, choice])).values()];
  const mainName = character.name.replace(/\s+\([^()]*\)\s*$/, "");
  const previewMain = previewChoices[0] ?? character;
  const mainCharacter = preview
    ? previewMain
    : (choices.find((choice) => choice.isMain) ??
      choices.find((choice) => choice.name === mainName) ??
      character);
  const orderedChoices = [
    mainCharacter,
    ...choices.filter((choice) => choice.id !== mainCharacter.id),
  ];
  const [selectedVersion, setSelectedVersion] = useState(
    preview ? previewMain.slug : character.slug,
  );
  const defaultSagaSlug = variants[0]?.slug ?? "";
  const selectedChoice = orderedChoices.find((choice) => choice.slug === selectedVersion);
  const selectedVersionValue = preview
    ? selectedVersion
    : selectedSeries
      ? `series:${selectedSeries}`
      : character.slug;

  return (
    <div className="space-y-3 border-t border-white/10 p-4">
      <label className="block space-y-1.5">
        <span className="wiki-infobox-label">{labels.version}</span>
        <select
          value={selectedVersionValue}
          aria-label={labels.version}
          onChange={(event) => {
            const target = orderedChoices.find(
              (version) => version.slug === event.currentTarget.value,
            );
            if (!target) return;
            if (preview) setSelectedVersion(target.slug);
            if (target.series) {
              router.replace(`${pathname}?series=${encodeURIComponent(target.series)}`, {
                scroll: false,
              });
            } else if (
              target.isMain ||
              target.slug === character.slug ||
              target.slug === "goku-main"
            ) {
              router.replace(pathname, { scroll: false });
            } else if (!preview) {
              router.push(`/wiki/characters/${target.slug}`);
            } else {
              router.replace(pathname, { scroll: false });
            }
          }}
          className="min-h-11 w-full rounded-lg border border-white/15 bg-dbz-bg px-3 text-base text-white focus-visible:outline-2 focus-visible:outline-dbz-orange sm:text-sm"
        >
          {orderedChoices.map((version) => (
            <option key={version.id} value={version.slug}>
              {preview || version.id !== mainCharacter.id
                ? version.label || version.name
                : `${labels.main}: ${version.label || version.name}`}
            </option>
          ))}
        </select>
      </label>
      {preview && selectedChoice?.series == null && selectedVersion !== previewChoices[0]?.slug && (
        <p className="text-xs leading-relaxed text-white/55" aria-live="polite">
          {labels.previewContentNotLinked.replace("{version}", selectedChoice?.name ?? "")}
        </p>
      )}
      {variants.length > 1 && (
        <label className="block space-y-1.5">
          <span className="wiki-infobox-label">{labels.saga}</span>
          <select
            value={selectedSagaSlug ?? defaultSagaSlug}
            aria-label={labels.saga}
            onChange={(event) => {
              const next = event.currentTarget.value;
              const query = new URLSearchParams();
              if (selectedSeries) query.set("series", selectedSeries);
              query.set("saga", next);
              router.replace(`${pathname}?${query.toString()}`, { scroll: false });
            }}
            className="min-h-11 w-full rounded-lg border border-white/15 bg-dbz-bg px-3 text-base text-white focus-visible:outline-2 focus-visible:outline-dbz-orange sm:text-sm"
          >
            {variants.map((variant) => (
              <option key={variant.id} value={variant.slug}>
                {variant.sagaName}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
