import { EmptyState } from "@/components/kit/EmptyState";
import { T } from "@/components/T";
import { VIE_EMPTY, type VieEmptyKind } from "@/lib/vie-empty";

/**
 * État vide illustré et traduit (fr/en/ja par `<T>`), avec au moins une sortie :
 * la scène et les liens viennent de `lib/vie-empty.ts`, les textes des messages.
 */
export function VieEmpty({ kind, className }: { kind: VieEmptyKind; className?: string }) {
  const def = VIE_EMPTY[kind];
  return (
    <EmptyState
      className={className}
      illustration={def.art}
      title={<T k={`vie.empty.${kind}.title`} />}
      description={<T k={`vie.empty.${kind}.description`} />}
      actions={def.actions.map((a) => ({
        href: a.href,
        external: a.external,
        label: <T k={`vie.cta.${a.cta}`} />,
      }))}
    />
  );
}
