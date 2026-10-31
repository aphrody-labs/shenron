"use client";

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

const SUMMARY_VERSION_SLUG = "goku-summary";

/** Selects a character timeline, then a saga-specific state in that timeline. */
export function CharacterPageSelectors({
  character,
  versions,
  previewChoices,
  variants,
  labels,
  selectedTimelineSlug,
  selectedSagaSlug,
  preview = false,
}: {
  character: CharacterChoice;
  versions: CharacterChoice[];
  previewChoices: CharacterChoice[];
  variants: CharacterVariant[];
  labels: {
    version: string;
    saga: string;
    main: string;
  };
  selectedTimelineSlug: string;
  selectedSagaSlug: string | null;
  preview?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const choiceSet = preview ? previewChoices : [character, ...versions];
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
  const defaultSagaSlug = variants[0]?.slug ?? "";

  return (
    <div className="space-y-3 border-t border-white/10 p-4">
      <label className="block space-y-1.5">
        <span className="wiki-infobox-label">{labels.version}</span>
        <select
          value={selectedTimelineSlug || (preview ? previewMain.slug : character.slug)}
          aria-label={labels.version}
          onChange={(event) => {
            const target = orderedChoices.find(
              (version) => version.slug === event.currentTarget.value,
            );
            if (!target) return;
            if (target.slug === SUMMARY_VERSION_SLUG) {
              router.replace(`${pathname}?timeline=${SUMMARY_VERSION_SLUG}`, { scroll: false });
            } else if (preview) {
              const query = new URLSearchParams({ timeline: target.slug });
              router.replace(`${pathname}?${query}`, { scroll: false });
            } else if (target.slug !== selectedTimelineSlug) {
              router.push(`/wiki/characters/${target.slug}`);
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
      {variants.length > 0 && (
        <label className="block space-y-1.5">
          <span className="wiki-infobox-label">{labels.saga}</span>
          <select
            value={selectedSagaSlug ?? defaultSagaSlug}
            aria-label={labels.saga}
            onChange={(event) => {
              const next = event.currentTarget.value;
              const query = new URLSearchParams();
              if (preview) query.set("timeline", selectedTimelineSlug || previewMain.slug);
              query.set("saga", next);
              router.replace(`${pathname}?${query.toString()}`, { scroll: false });
            }}
            className="min-h-11 w-full rounded-lg border border-white/15 bg-dbz-bg px-3 text-base text-white focus-visible:outline-2 focus-visible:outline-dbz-orange sm:text-sm"
          >
            {variants.map((variant) => (
              <option key={variant.id} value={variant.slug}>
                {variant.sagaSeries
                  ? `${variant.sagaSeries} · ${variant.sagaName}`
                  : variant.sagaName}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
