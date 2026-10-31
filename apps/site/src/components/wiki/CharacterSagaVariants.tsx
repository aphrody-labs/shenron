// SPDX-License-Identifier: Apache-2.0
import { WikiMarkdown } from "@/components/wiki/WikiMarkdown";
import type { ReactNode } from "react";
import { CharacterSagaVariantsTabs } from "@/components/wiki/CharacterSagaVariantsTabs";
import type { AccessSnapshot } from "@aphrody/shenron-config/wiki-launch";
import type { CharacterVariant } from "@/lib/shenron";
import type { CharacterSagaMessages } from "@/lib/wiki-character-version-messages";

/** Parse editorial summaries on the server; the client only selects their rendered nodes. */
export function CharacterSagaVariants({
  variants,
  powerScalingNodes,
  transformationNodes,
  techniqueNodes,
  messages,
  children,
  activeVariantIndex,
  showPortrait,
  ...props
}: {
  variants: CharacterVariant[];
  characterName: string;
  access?: AccessSnapshot | null;
  powerScalingNodes: ReactNode[];
  transformationNodes: ReactNode[];
  techniqueNodes: ReactNode[];
  messages: CharacterSagaMessages;
  children?: ReactNode;
  activeVariantIndex: number;
  showPortrait?: boolean;
}) {
  if (variants.length === 0) return children ?? null;
  return (
    <CharacterSagaVariantsTabs
      {...props}
      overviewNode={children ?? null}
      activeVariantIndex={activeVariantIndex}
      showPortrait={showPortrait}
      variants={variants.map(({ summary: _summary, ...variant }) => variant)}
      summaryNodes={variants.map((variant) =>
        variant.summary ? <WikiMarkdown key={variant.id} body={variant.summary} /> : null,
      )}
      transformationNodes={transformationNodes}
      techniqueNodes={techniqueNodes}
      messages={messages}
      powerScalingNodes={powerScalingNodes}
    />
  );
}
