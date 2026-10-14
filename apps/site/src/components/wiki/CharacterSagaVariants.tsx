// SPDX-License-Identifier: Apache-2.0
import { WikiMarkdown } from "@/components/wiki/WikiMarkdown";
import { CharacterSagaVariantsTabs } from "@/components/wiki/CharacterSagaVariantsTabs";
import type { AccessSnapshot } from "@/lib/wiki-launch";
import type { CharacterVariant } from "@/lib/shenron";

/** Parse editorial summaries on the server; the client only selects their rendered nodes. */
export function CharacterSagaVariants({
  variants,
  ...props
}: {
  variants: CharacterVariant[];
  characterName: string;
  characterImage: string | null;
  access?: AccessSnapshot | null;
}) {
  if (variants.length === 0) return null;
  return (
    <CharacterSagaVariantsTabs
      {...props}
      variants={variants.map(({ summary: _summary, ...variant }) => variant)}
      summaryNodes={variants.map((variant) =>
        variant.summary ? <WikiMarkdown key={variant.id} body={variant.summary} /> : null,
      )}
    />
  );
}
