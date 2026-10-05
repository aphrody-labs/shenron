"use client";

// The editor paints the shared kit on the host M3 roles: every kit part below takes the planche
// surface (semantic tokens), and every popup React portals out of the editor tree carries
// `data-koharu-ui-layer`, the hook `styles.css` scopes the editor's tokens and type to.
import type { ReactNode } from "react";

import { SurfaceScope } from "../../components/surface";

const editorLayer = { "data-koharu-ui-layer": "" } as const;

export function KoharuSurface({ children }: { children?: ReactNode }) {
  return (
    <SurfaceScope variant="planche" portalAttributes={editorLayer}>
      {children}
    </SurfaceScope>
  );
}
