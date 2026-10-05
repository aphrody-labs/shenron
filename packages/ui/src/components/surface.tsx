"use client";

/**
 * Surface variant of the kit's overlays and controls.
 *
 * - `toriyama` (default) keeps each part's Dragon Ball look: ink border, offset shadow and the
 *   orange-yellow band on top of popups.
 * - `planche` follows the « Planche couleur » direction on the semantic tokens (`bg-popover`,
 *   `text-popover-foreground`, `border-border`, `bg-accent`, `text-muted-foreground`…): flat
 *   fills, a 1 px ink line, no gradient band, no glow, no drop shadow, sentence case. The tokens
 *   resolve to the site palette on dragonballfr.com and to the host M3 roles in the Koharu
 *   editor, so the same parts read on the night background and in a light scheme.
 *
 * A part's own `variant` prop wins; otherwise it follows the nearest `SurfaceScope`; a popup
 * passes its resolved variant to the parts it contains (menu items, dialog titles…).
 */
import { createContext, use, useMemo, type ReactNode } from "react";

type SurfaceVariant = "toriyama" | "planche";

/** Data attributes stamped on every portaled kit surface (popups, dialogs, toast viewport). */
type PortalAttributes = Readonly<Record<`data-${string}`, string>>;

interface Surface {
  variant: SurfaceVariant | undefined;
  portalAttributes: PortalAttributes | undefined;
}

const SurfaceContext = createContext<Surface>({ variant: undefined, portalAttributes: undefined });

/**
 * Sets the kit surface for a subtree. `portalAttributes` lets a host stylesheet scoped by an
 * attribute (the Koharu editor's `[data-koharu-ui-layer]`) reach the popups React portals out of
 * its tree. Unset values inherit from the enclosing scope.
 */
function SurfaceScope({
  variant,
  portalAttributes,
  children,
}: {
  variant?: SurfaceVariant;
  portalAttributes?: PortalAttributes;
  children?: ReactNode;
}) {
  const parent = use(SurfaceContext);
  const nextVariant = variant ?? parent.variant;
  const nextAttributes = portalAttributes ?? parent.portalAttributes;
  const value = useMemo(
    () => ({ variant: nextVariant, portalAttributes: nextAttributes }),
    [nextVariant, nextAttributes],
  );
  return <SurfaceContext value={value}>{children}</SurfaceContext>;
}

/** The enclosing surface: its variant (if a scope set one) and the attributes for portals. */
function useSurface(): Surface {
  return use(SurfaceContext);
}

/** True when a part paints the `planche` surface: its own prop first, then the scope. */
function usePlanche(variant: string | undefined): boolean {
  const surface = useSurface();
  return (variant ?? surface.variant) === "planche";
}

export { SurfaceScope, useSurface, usePlanche, type PortalAttributes, type SurfaceVariant };
