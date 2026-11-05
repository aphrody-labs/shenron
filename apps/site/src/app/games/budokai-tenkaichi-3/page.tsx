// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { ogMeta } from "@/lib/og";
import Bt3Player from "./Bt3Player";

export const metadata: Metadata = {
  title: "Dragon Ball Z : Budokai Tenkaichi 3 — Plein écran",
  description:
    "Joue à Dragon Ball Z : Budokai Tenkaichi 3 dans ton navigateur en plein écran WebGPU.",
  ...ogMeta({
    title: "Dragon Ball Z : Budokai Tenkaichi 3 — DBFR",
    description: "Joue à Budokai Tenkaichi 3 dans ton navigateur en plein écran.",
    canonical: "/games/budokai-tenkaichi-3",
  }),
};

export default function Bt3Page() {
  return (
    <main className="fixed inset-0 z-50 flex h-screen w-screen flex-col items-center justify-center overflow-hidden bg-black select-none">
      <Bt3Player />
    </main>
  );
}
