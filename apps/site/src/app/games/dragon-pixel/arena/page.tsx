// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { DragonPixelArena } from "@/components/games/DragonPixelArena";
import { ogMeta } from "@/lib/og";

export const metadata: Metadata = {
  title: "Dragon Pixel : arène",
  description:
    "Le moteur de combat Rust de Dragon Pixel, rendu en 3D par Bevy sur WebGPU, au clavier ou à la manette.",
  ...ogMeta({
    title: "Dragon Pixel : arène — DBFR",
    description: "Combat Dragon Ball rendu par Bevy sur WebGPU, au clavier ou à la manette.",
    canonical: "/games/dragon-pixel/arena",
  }),
};

export default function DragonPixelArenaPage() {
  return <DragonPixelArena />;
}
