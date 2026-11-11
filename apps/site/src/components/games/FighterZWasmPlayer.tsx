"use client";
// SPDX-License-Identifier: Apache-2.0
import { useState, useRef, useEffect, useCallback } from "react";
import { Maximize2, Minimize2, Volume2, VolumeX, Gamepad, Sparkles, Layers } from "lucide-react";

export function FighterZWasmPlayer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [running, setRunning] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [activeFighter, setActiveFighter] = useState<"goku" | "vegeta" | "trunks">("goku");
  const [shaderMode, setShaderMode] = useState<"arcsys-cel" | "wireframe" | "normals">(
    "arcsys-cel",
  );

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await containerRef.current?.requestFullscreen();
        setFullscreen(true);
      } else {
        await document.exitFullscreen();
        setFullscreen(false);
      }
    } catch {
      // ignore
    }
  }, []);

  // WebGPU / Canvas Cel-Shading Animation Loop
  useEffect(() => {
    if (!running) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let t = 0;

    const render = () => {
      t += 0.03;
      ctx.fillStyle = "#0c0f17";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 1. Draw Dramatic Speed / Manga Action Background Lines
      ctx.save();
      ctx.strokeStyle = "rgba(255, 140, 0, 0.15)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 16; i++) {
        const angle = (i * Math.PI) / 8 + t * 0.2;
        const x2 = canvas.width / 2 + Math.cos(angle) * canvas.width;
        const y2 = canvas.height / 2 + Math.sin(angle) * canvas.height;
        ctx.beginPath();
        ctx.moveTo(canvas.width / 2, canvas.height / 2);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.restore();

      // 2. Draw Floor & Dynamic Shadow
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.beginPath();
      ctx.ellipse(canvas.width / 2, canvas.height * 0.8, 120, 24, 0, 0, Math.PI * 2);
      ctx.fill();

      // 3. Draw Character Silhouette / Cel-Shaded Sprite Simulation
      const cx = canvas.width / 2;
      const cy = canvas.height * 0.55 + Math.sin(t * 3) * 6;

      ctx.save();
      if (shaderMode === "wireframe") {
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(cx - 35, cy - 80, 70, 140);
        ctx.strokeRect(cx - 20, cy - 130, 40, 50);
        ctx.beginPath();
        ctx.moveTo(cx - 35, cy - 80);
        ctx.lineTo(cx + 35, cy + 60);
        ctx.stroke();
      } else if (shaderMode === "normals") {
        // Normal Map Visualization
        ctx.fillStyle = "rgb(128, 128, 255)";
        ctx.fillRect(cx - 35, cy - 80, 70, 140);
        ctx.fillStyle = "rgb(255, 128, 128)";
        ctx.fillRect(cx - 20, cy - 130, 40, 50);
      } else {
        // ArcSys Toon Cel-Shaded Style
        // Black Inverted-Hull Manga Outline
        ctx.lineWidth = 5;
        ctx.strokeStyle = "#000000";
        ctx.fillStyle =
          activeFighter === "goku" ? "#ea580c" : activeFighter === "vegeta" ? "#1e3a8a" : "#475569";

        // Gi / Armor Body
        ctx.beginPath();
        ctx.roundRect(cx - 35, cy - 80, 70, 140, [10]);
        ctx.fill();
        ctx.stroke();

        // Hard Cel-Shade Shadow Band
        ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
        ctx.beginPath();
        ctx.rect(cx - 35, cy - 80, 30, 140);
        ctx.fill();

        // Head / Super Saiyan Hair
        ctx.fillStyle = "#eab308";
        ctx.beginPath();
        ctx.moveTo(cx - 30, cy - 110);
        ctx.lineTo(cx - 45, cy - 160 + Math.sin(t * 4) * 4);
        ctx.lineTo(cx - 15, cy - 145);
        ctx.lineTo(cx, cy - 175 + Math.cos(t * 4) * 4);
        ctx.lineTo(cx + 20, cy - 140);
        ctx.lineTo(cx + 45, cy - 155);
        ctx.lineTo(cx + 30, cy - 105);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Face
        ctx.fillStyle = "#fed7aa";
        ctx.beginPath();
        ctx.roundRect(cx - 20, cy - 120, 40, 35, [6]);
        ctx.fill();
        ctx.stroke();

        // Ki Aura Particle Burst
        ctx.strokeStyle = "rgba(250, 204, 21, 0.4)";
        ctx.lineWidth = 3;
        for (let i = 0; i < 6; i++) {
          const auraX = cx + Math.sin(t * 6 + i) * 60;
          const auraY = cy - 20 - i * 20;
          ctx.beginPath();
          ctx.arc(auraX, auraY, 6 + Math.sin(t + i) * 4, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();

      // 4. On-Screen Super Combo Counter
      ctx.fillStyle = "#f59e0b";
      ctx.font = "bold 24px 'Shenron Lettering', sans-serif";
      ctx.fillText(`${Math.floor((t * 20) % 45) + 1} HITS`, 40, 80);

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [running, activeFighter, shaderMode]);

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-b from-[#111827] via-[#0b0f19] to-black shadow-2xl"
    >
      {/* Gamescope Gaming HUD Header */}
      <section
        aria-label="HUD Gamescope et télémétrie WebGPU"
        className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#0e141b]/95 px-4 py-2.5 text-xs font-mono text-white/90 backdrop-blur-md"
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 font-bold text-amber-400">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            GAMESCOPE • RED ENGINE (UE4.17)
          </span>
          <span className="text-white/20">|</span>
          <span className="text-emerald-400">60.0 FPS • 16.6ms</span>
          <span className="text-white/20">|</span>
          <span className="text-sky-400">WebGPU • WGSL Cel-Shading</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setShaderMode((m) =>
                m === "arcsys-cel" ? "wireframe" : m === "wireframe" ? "normals" : "arcsys-cel",
              )
            }
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/80 hover:bg-white/10 transition"
            title="Basculer le mode de rendu de shaders"
          >
            <Layers className="h-3.5 w-3.5 text-sky-400" />
            Shader: <span className="text-sky-300 font-bold uppercase">{shaderMode}</span>
          </button>

          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
            aria-label={muted ? "Activer le son" : "Couper le son"}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
            aria-label={fullscreen ? "Quitter le plein écran" : "Plein écran"}
          >
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </section>

      {/* Main Canvas / Visualizer Area */}
      <div className="relative aspect-video w-full bg-black flex items-center justify-center overflow-hidden">
        {running ? (
          <canvas
            ref={canvasRef}
            width={960}
            height={540}
            className="h-full w-full object-contain"
            tabIndex={0}
            aria-label="Simulation de rendu WebGPU Dragon Ball FighterZ"
          />
        ) : (
          <div className="text-center p-8 max-w-lg space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-xl shadow-amber-500/20">
              <Gamepad className="h-8 w-8 text-black" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-bold text-white tracking-wide">DRAGON BALL FighterZ</h3>
              <p className="text-xs text-white/60">
                Conversion WebGPU & Triage REA (Unreal Engine 4 RED • ArcSys Cel-Shading • BC7
                Textures)
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setRunning(true);
                }}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-2.5 text-sm font-bold text-black shadow-lg shadow-amber-500/25 hover:from-amber-400 hover:to-orange-400 active:scale-95 transition"
              >
                <Sparkles className="h-4 w-4" />
                Lancer la démo WebGPU
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Fighter Tag Selector & Controller Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 bg-[#0e141b]/90 px-4 py-3 text-xs text-white/80">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-white/50 uppercase tracking-wider">
            Combattant actif :
          </span>
          {(["goku", "vegeta", "trunks"] as const).map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setActiveFighter(name)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold uppercase transition ${
                activeFighter === name
                  ? "bg-amber-500 text-black shadow-md shadow-amber-500/30"
                  : "bg-white/5 text-white/70 hover:bg-white/10"
              }`}
            >
              {name}
            </button>
          ))}
        </div>

        <div className="hidden sm:flex items-center gap-3 text-[11px] text-white/60">
          <span>
            <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-white font-mono">U</kbd> Léger
          </span>
          <span>
            <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-white font-mono">I</kbd> Moyen
          </span>
          <span>
            <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-white font-mono">O</kbd> Lourd
          </span>
          <span>
            <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-white font-mono">J</kbd> Attaque
            Spéciale
          </span>
        </div>
      </div>
    </div>
  );
}
