// SPDX-License-Identifier: Apache-2.0
export function sceneViewportMetrics(input: {
  viewportHeight: number;
  documentTop: number;
  bottomOcclusion: number;
}) {
  const viewport = Math.max(0, Number.isFinite(input.viewportHeight) ? input.viewportHeight : 0);
  const top = Math.max(0, Number.isFinite(input.documentTop) ? Math.ceil(input.documentTop) : 0);
  const bottom = Math.min(
    viewport,
    Math.max(0, Number.isFinite(input.bottomOcclusion) ? Math.ceil(input.bottomOcclusion) : 0),
  );
  return {
    top,
    bottom,
    offset: top + bottom,
    available: Math.max(0, Math.floor(viewport - top - bottom)),
  };
}
