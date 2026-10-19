// SPDX-License-Identifier: Apache-2.0
"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Play, Pause, Scissors, Sparkles, Layers, Sliders, Film, ArrowLeft } from "lucide-react";

export function StudioVideoWorkspace() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSeconds, setCurrentSeconds] = useState(350);
  const [selectedTrack, setSelectedTrack] = useState<"video" | "aura" | "sfx">("video");
  const [auraIntensity, setAuraIntensity] = useState(85);
  const [activePreset, setActivePreset] = useState("Beerus Awakening");

  const frameSrc = currentSeconds >= 300 
    ? "/generated/frames/dbs-876/beerus-awakening-350s.png"
    : "/generated/frames/dbs-876/kaioshin-warning-120s.png";

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-zinc-950 text-white font-sans overflow-hidden">
      {/* Top Header / Studio Toolbar */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-purple-900/40 bg-zinc-900/80 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <Link href="/studio" className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-purple-500 animate-pulse shadow-[0_0_12px_#a855f7]" />
            <h1 className="font-display font-bold text-lg tracking-wide uppercase text-purple-200">
              Shenron Video Studio <span className="text-xs text-purple-400 font-mono font-normal ml-2">DBS 876: Dieu de la Destruction Beerus</span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-mono px-2.5 py-1 rounded bg-purple-950/80 border border-purple-500/30 text-purple-300">
            Backend: FilmCraft NLE Active
          </span>
          <span className="text-xs font-mono px-2.5 py-1 rounded bg-amber-950/80 border border-amber-500/30 text-amber-300">
            Engine: Remotion / HyperFrame
          </span>
          <button 
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm transition shadow-[0_0_16px_rgba(168,85,247,0.4)]"
            onClick={() => alert("Master rendu envoyé vers le CDN DBFR")}
          >
            <Sparkles className="w-4 h-4" />
            Exporter le Master
          </button>
        </div>
      </header>

      {/* Main Workspace: Left Controls / Center Viewport / Right Layers */}
      <div className="flex-1 flex min-h-0">
        {/* Left Side: FilmCraft & Composition Presets */}
        <div className="w-72 border-r border-purple-900/30 bg-zinc-900/50 p-4 flex flex-col gap-5 overflow-y-auto">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-purple-400 mb-3 flex items-center gap-2">
              <Film className="w-3.5 h-3.5" /> Séquence FilmCraft
            </h3>
            <div className="space-y-2">
              <button 
                onClick={() => { setCurrentSeconds(350); setActivePreset("Beerus Awakening"); }}
                className={`w-full text-left p-3 rounded-lg border text-sm transition ${
                  activePreset === "Beerus Awakening" 
                    ? "bg-purple-900/40 border-purple-500/60 text-white shadow-[0_0_12px_rgba(168,85,247,0.2)]" 
                    : "bg-zinc-800/40 border-zinc-700/40 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <div className="font-semibold">05:50 - Éveil de Beerus</div>
                <div className="text-xs opacity-75 font-mono mt-1">Frame 8,400 • 1080p AVC</div>
              </button>

              <button 
                onClick={() => { setCurrentSeconds(120); setActivePreset("Kaioshin Warning"); }}
                className={`w-full text-left p-3 rounded-lg border text-sm transition ${
                  activePreset === "Kaioshin Warning" 
                    ? "bg-purple-900/40 border-purple-500/60 text-white shadow-[0_0_12px_rgba(168,85,247,0.2)]" 
                    : "bg-zinc-800/40 border-zinc-700/40 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <div className="font-semibold">02:00 - Alerte Kaioshin</div>
                <div className="text-xs opacity-75 font-mono mt-1">Frame 2,880 • 1080p AVC</div>
              </button>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-purple-400 mb-3 flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5" /> Ajustements HyperFrame
            </h3>
            <div className="space-y-3 bg-zinc-950/60 p-3 rounded-xl border border-purple-900/20">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-zinc-400">Intensité Aura Pourpre</span>
                  <span className="font-mono text-purple-300">{auraIntensity}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={auraIntensity}
                  onChange={(e) => setAuraIntensity(Number(e.target.value))}
                  className="w-full accent-purple-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-zinc-400">Position Temporelle</span>
                  <span className="font-mono text-purple-300">{currentSeconds}s</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="1397" 
                  value={currentSeconds}
                  onChange={(e) => setCurrentSeconds(Number(e.target.value))}
                  className="w-full accent-purple-500 cursor-pointer"
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-purple-400 mb-2 flex items-center gap-2">
              <Layers className="w-3.5 h-3.5" /> Calques Vectoriels Manga
            </h3>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer p-2 rounded bg-zinc-800/40 hover:bg-zinc-800/70">
                <input type="checkbox" defaultChecked className="accent-purple-500" />
                <span>Onomatopées Toriyama (Gogogo)</span>
              </label>
              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer p-2 rounded bg-zinc-800/40 hover:bg-zinc-800/70">
                <input type="checkbox" defaultChecked className="accent-purple-500" />
                <span>Lignes de fuite de Hakai</span>
              </label>
            </div>
          </div>
        </div>

        {/* Center: Viewport Monitor (Pixel-Perfect Anime + Composition) */}
        <div className="flex-1 flex flex-col bg-black/90 p-4 items-center justify-center relative">
          <div 
            className="relative w-full max-w-4xl aspect-video rounded-xl overflow-hidden border border-purple-500/40 shadow-[0_0_40px_rgba(168,85,247,0.25)] flex items-center justify-center bg-zinc-950"
            style={{
              boxShadow: `0 0 ${auraIntensity * 0.5}px rgba(168, 85, 247, ${auraIntensity / 120})`,
            }}
          >
            {/* Base Anime Episode Frame */}
            <Image
              src={frameSrc}
              alt="Episode Frame"
              fill
              className="object-contain"
              priority
            />

            {/* HyperFrame / Toriyama Vector Overlay Layer */}
            <div 
              className="absolute inset-0 pointer-events-none mix-blend-screen transition-opacity"
              style={{ opacity: auraIntensity / 100 }}
            >
              <div className="w-full h-full bg-radial from-purple-500/20 via-purple-900/10 to-transparent" />
            </div>

            {/* Timecode Indicator */}
            <div className="absolute top-4 left-4 px-3 py-1.5 rounded-lg bg-black/70 backdrop-blur-md border border-white/10 font-mono text-xs text-purple-300 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>{Math.floor(currentSeconds / 60).toString().padStart(2, '0')}:{(Math.round(currentSeconds) % 60).toString().padStart(2, '0')}:00</span>
            </div>

            {/* Resolution Badge */}
            <div className="absolute top-4 right-4 px-2.5 py-1 rounded bg-black/70 backdrop-blur-md border border-white/10 font-mono text-xs text-zinc-400">
              1080p FHD • 23.976 fps
            </div>
          </div>

          {/* Quick Monitor Controls */}
          <div className="flex items-center gap-4 mt-4">
            <button 
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-3 rounded-full bg-purple-600 hover:bg-purple-500 text-white transition shadow-[0_0_12px_rgba(168,85,247,0.3)]"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>
            <button 
              onClick={() => alert("Point de coupe Razor appliqué sur la séquence FilmCraft")}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition text-xs font-semibold"
            >
              <Scissors className="w-4 h-4" />
              Razor Cut
            </button>
          </div>
        </div>
      </div>

      {/* Bottom: Multitrack Timeline */}
      <div className="h-44 border-t border-purple-900/40 bg-zinc-900/90 flex flex-col p-3">
        <div className="flex items-center justify-between pb-2 border-b border-zinc-800 text-xs text-zinc-400 font-mono">
          <span>Pistes Timeline (FilmCraft Engine)</span>
          <span>Durée Totale : 23:17.72</span>
        </div>

        <div className="flex-1 flex flex-col justify-around pt-2">
          {/* Track V2: Toriyama Manga FX / HyperFrame */}
          <div className="flex items-center gap-3">
            <div className="w-20 text-xs font-mono text-purple-400 font-bold">V2 [FX]</div>
            <div className="flex-1 h-7 rounded bg-purple-950/60 border border-purple-500/40 relative overflow-hidden flex items-center px-3">
              <span className="text-xs text-purple-300 font-medium">Toriyama SVG Auras & Onomatopées</span>
            </div>
          </div>

          {/* Track V1: Video Source (DBS 876) */}
          <div className="flex items-center gap-3">
            <div className="w-20 text-xs font-mono text-emerald-400 font-bold">V1 [Vidéo]</div>
            <div className="flex-1 h-7 rounded bg-emerald-950/60 border border-emerald-500/40 relative overflow-hidden flex items-center px-3">
              <span className="text-xs text-emerald-300 font-medium">dbs-876.mp4 (Dragon Ball Super - Arc Beerus)</span>
            </div>
          </div>

          {/* Track A1: Audio (AAC Stereo) */}
          <div className="flex items-center gap-3">
            <div className="w-20 text-xs font-mono text-cyan-400 font-bold">A1 [Audio]</div>
            <div className="flex-1 h-7 rounded bg-cyan-950/60 border border-cyan-500/40 relative overflow-hidden flex items-center px-3">
              <span className="text-xs text-cyan-300 font-medium">Master Audio VF/VOSTFR (44.1 kHz)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
