// SPDX-License-Identifier: Apache-2.0
"use client";

import { useState, useMemo } from "react";
import { ShenronGpuCanvas } from "@/components/canvas/ShenronGpuCanvas";
import type { MangaBoard, CanvasBackendPreference } from "@shenron/engine";

const KI_THEMES = [
  {
    name: "Ultra Instinct",
    color: "#e2e8f0",
    accent: "#38bdf8",
    desc: "Aura divine argentée et particules d'azur",
  },
  {
    name: "Super Saiyan",
    color: "#facc15",
    accent: "#f97316",
    desc: "Énergie pure dorée et décharges ardentes",
  },
  {
    name: "Super Saiyan Blue",
    color: "#06b6d4",
    accent: "#3b82f6",
    desc: "Ki divin concentré bleu céleste",
  },
  {
    name: "Super Saiyan Rosé",
    color: "#ec4899",
    accent: "#a855f7",
    desc: "Aura sombre magenta et pourpre",
  },
  {
    name: "Kaio-ken",
    color: "#ef4444",
    accent: "#dc2626",
    desc: "Surpuissance écarlate amplifiée",
  },
];

export function UnifiedCanvasShowcase() {
  const [activeTab, setActiveTab] = useState<"ki" | "manga">("ki");
  const [selectedTheme, setSelectedTheme] = useState(0);
  const [bubbleStyle, setBubbleStyle] = useState<"shout" | "normal" | "thought">("shout");
  const [preference, setPreference] = useState<CanvasBackendPreference>("auto");

  const mangaBoard: MangaBoard = useMemo(() => {
    return {
      width: 780,
      height: 440,
      background: "#0f172a",
      panels: [
        {
          id: "panel-1",
          x: 20,
          y: 20,
          width: 360,
          height: 400,
          borderWidth: 3,
          borderColor: "#38bdf8",
          backgroundColor: "#1e293b",
          screentone: "dots",
          screentoneDensity: 8,
        },
        {
          id: "panel-2",
          x: 400,
          y: 20,
          width: 360,
          height: 190,
          borderWidth: 3,
          borderColor: "#f59e0b",
          backgroundColor: "#1e293b",
          screentone: "lines",
          screentoneDensity: 10,
        },
        {
          id: "panel-3",
          x: 400,
          y: 230,
          width: 360,
          height: 190,
          borderWidth: 3,
          borderColor: "#ec4899",
          backgroundColor: "#1e293b",
          screentone: "crosshatch",
          screentoneDensity: 12,
        },
      ],
      bubbles: [
        {
          id: "bubble-1",
          x: 40,
          y: 50,
          width: 320,
          height: 140,
          style: bubbleStyle,
          tailTip: { x: 90, y: 260 },
          text:
            bubbleStyle === "shout"
              ? "KA-ME-HA-ME-HA !!!"
              : bubbleStyle === "normal"
                ? "C'est la fin pour toi, Freezer !"
                : "Son ki augmente encore...",
          fontSize: bubbleStyle === "shout" ? 20 : 16,
          fillColor: "#ffffff",
          borderColor: "#0f172a",
          borderWidth: bubbleStyle === "shout" ? 4 : 2.5,
        },
        {
          id: "bubble-2",
          x: 430,
          y: 40,
          width: 140,
          height: 150,
          style: "normal",
          vertical: true,
          text: "限界突破",
          fontSize: 22,
          fillColor: "#ffffff",
          borderColor: "#0f172a",
        },
        {
          id: "bubble-3",
          x: 440,
          y: 250,
          width: 280,
          height: 110,
          style: "thought",
          text: "Je dois protéger la Terre...",
          fontSize: 15,
          fillColor: "#f8fafc",
          borderColor: "#0f172a",
        },
      ],
    };
  }, [bubbleStyle]);

  const currentTheme = KI_THEMES[selectedTheme];

  return (
    <section className="dbz-panel p-6 mb-12 border-2 border-dbz-orange shadow-[0_0_24px_rgba(249,115,22,0.15)]">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <div className="text-xs uppercase tracking-widest text-dbz-blue-light font-mono font-bold mb-1">
            Moteur Graphique Unifié Shenron
          </div>
          <h2 className="text-2xl font-saiyan text-dbz-yellow uppercase tracking-wide">
            WebGPU Hardware + WASM Koharu + Canvas2D
          </h2>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex items-center gap-2 bg-black/40 p-1 rounded-lg border border-dbz-border">
          <button
            type="button"
            onClick={() => setActiveTab("ki")}
            className={`px-4 py-1.5 text-xs font-bold rounded transition-all ${
              activeTab === "ki"
                ? "bg-dbz-orange text-white shadow-md shadow-orange-500/20"
                : "text-gray-300 hover:text-white"
            }`}
          >
            Aura Ki & Particules
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("manga")}
            className={`px-4 py-1.5 text-xs font-bold rounded transition-all ${
              activeTab === "manga"
                ? "bg-dbz-orange text-white shadow-md shadow-orange-500/20"
                : "text-gray-300 hover:text-white"
            }`}
          >
            Planche Manga & Bulles
          </button>
        </div>
      </div>

      {/* Main Interactive Canvas Surface */}
      <div className="relative aspect-[16/9] w-full max-h-[460px] bg-slate-950 rounded-xl overflow-hidden border-2 border-dbz-border shadow-inner">
        <ShenronGpuCanvas
          mode={activeTab}
          interactive
          showBackendBadge
          preference={preference}
          kiConfig={{
            count: 240,
            baseColor: currentTheme.color,
            accentColor: currentTheme.accent,
            speed: 1.1,
            burstIntensity: 0.45,
          }}
          mangaBoard={mangaBoard}
          className="w-full h-full"
        />

        {/* Interactive Helper Overlay */}
        <div className="absolute top-3 left-3 px-2.5 py-1 rounded bg-black/60 backdrop-blur-sm border border-white/10 text-[11px] text-gray-300 font-mono pointer-events-none">
          Glisser pour naviguer (Pan) • Molette pour Zoomer
        </div>
      </div>

      {/* Interactive Controls Bar */}
      <div className="mt-5 pt-4 border-t border-dbz-border/60 flex flex-wrap items-center justify-between gap-4">
        {activeTab === "ki" ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-400 font-mono mr-1">Thème Ki :</span>
            {KI_THEMES.map((theme, i) => (
              <button
                key={theme.name}
                type="button"
                onClick={() => setSelectedTheme(i)}
                className={`px-3 py-1 rounded text-xs font-semibold transition-all border ${
                  selectedTheme === i
                    ? "border-dbz-yellow text-dbz-yellow bg-dbz-yellow/10"
                    : "border-transparent bg-slate-800/80 text-gray-300 hover:bg-slate-700"
                }`}
              >
                {theme.name}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-400 font-mono mr-1">Bulle procédurale :</span>
            {(["shout", "normal", "thought"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setBubbleStyle(s)}
                className={`px-3 py-1 rounded text-xs font-semibold uppercase tracking-wider transition-all border ${
                  bubbleStyle === s
                    ? "border-dbz-yellow text-dbz-yellow bg-dbz-yellow/10"
                    : "border-transparent bg-slate-800/80 text-gray-300 hover:bg-slate-700"
                }`}
              >
                {s === "shout" ? "Shout (Combat)" : s === "normal" ? "Dialogue" : "Pensée"}
              </button>
            ))}
          </div>
        )}

        {/* Backend Preference Picker */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 font-mono">Backend GPU :</span>
          <select
            value={preference}
            onChange={(e) => setPreference(e.target.value as CanvasBackendPreference)}
            className="bg-slate-900 border border-dbz-border text-xs rounded px-2.5 py-1 text-gray-200 font-mono focus:outline-none focus:border-dbz-orange"
          >
            <option value="auto">Auto (WebGPU ➜ WASM ➜ 2D)</option>
            <option value="webgpu">WebGPU Matériel</option>
            <option value="wasm">WASM koharu-canvas</option>
            <option value="canvas2d">Canvas 2D Universel</option>
          </select>
        </div>
      </div>
    </section>
  );
}
