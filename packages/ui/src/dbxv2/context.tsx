"use client";

/**
 * Labels shared by the private resource viewers. A plain React context: no server, no `bun`
 * module, no network. The host passes already-localised strings; English is the fallback.
 */
import { createContext, useContext, type ReactNode } from "react";

export interface Dbxv2Labels {
  loading: string;
  error: string;
  retry: string;
  scale: string;
  audioUnsupported: string;
  videoUnsupported: string;
  modelLoading: string;
  modelError: string;
  modelNoRenderer: string;
  modelNoWebgpu: string;
  meshes: string;
  primitives: string;
  nodes: string;
  materials: string;
  textures: string;
  animations: string;
  skins: string;
  size: string;
}

export const DEFAULT_DBXV2_LABELS: Dbxv2Labels = {
  loading: "Loading…",
  error: "The resource could not be loaded.",
  retry: "Retry",
  scale: "Scale ×{scale}",
  audioUnsupported: "Audio playback is not supported here.",
  videoUnsupported: "Video playback is not supported here.",
  modelLoading: "Loading the model…",
  modelError: "The model could not be loaded.",
  modelNoRenderer: "No 3D renderer is available; showing the model summary.",
  modelNoWebgpu: "WebGPU is unavailable; showing the model summary.",
  meshes: "Meshes",
  primitives: "Primitives",
  nodes: "Nodes",
  materials: "Materials",
  textures: "Textures",
  animations: "Animations",
  skins: "Skins",
  size: "Size",
};

const Context = createContext<Dbxv2Labels>(DEFAULT_DBXV2_LABELS);

export function Dbxv2UiProvider({
  labels,
  children,
}: {
  labels: Partial<Dbxv2Labels>;
  children: ReactNode;
}) {
  return (
    <Context.Provider value={{ ...DEFAULT_DBXV2_LABELS, ...labels }}>{children}</Context.Provider>
  );
}

export const useDbxv2Labels = (): Dbxv2Labels => useContext(Context);
