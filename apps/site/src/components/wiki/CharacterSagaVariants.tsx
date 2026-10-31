// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from "react";
import { CharacterSagaVariantsTabs } from "@/components/wiki/CharacterSagaVariantsTabs";
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
  characterName,
}: {
  variants: CharacterVariant[];
  characterName: string;
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
      characterName={characterName}
      overviewNode={children ?? null}
      activeVariantIndex={activeVariantIndex}
      showPortrait={showPortrait}
      variants={variants.map(({ summary: _summary, ...variant }) => variant)}
      transformationNodes={transformationNodes}
      techniqueNodes={techniqueNodes}
      messages={messages}
      powerScalingNodes={powerScalingNodes}
    />
  );
}
