// SPDX-License-Identifier: Apache-2.0
"use client";

import { createContext, useContext } from "react";

/** UI port implemented by the application's canonical atlas consumer. */
export interface AtlasPreview {
  readonly frameCount: number;
  readonly fps: number;
  readonly width: number;
  readonly height: number;
  draw(canvas: HTMLCanvasElement, elapsedMs: number): number;
  close(): void;
}

export type AtlasPreviewFactory = (
  manifest: unknown,
  image: Blob,
  signal: AbortSignal,
) => Promise<AtlasPreview>;

export const AtlasPreviewContext = createContext<AtlasPreviewFactory | null>(null);
export const useAtlasPreview = () => useContext(AtlasPreviewContext);
