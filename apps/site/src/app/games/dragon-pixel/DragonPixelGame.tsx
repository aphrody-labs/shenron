// SPDX-License-Identifier: Apache-2.0
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createGame, step, type FighterStyle, type GameState, type GameInput } from "./engine";

const STYLES: { id: FighterStyle; label: string; desc: string }[] = [
  { id: "balanced", label: "Équilibré (Goku)", desc: "Vitesse et puissance standard." },
  { id: "speed", label: "Vitesse (Vegeta)", desc: "Déplacement accru, réflexes vifs." },
  { id: "power", label: "Puissance (Broly)", desc: "Dégâts amplifiés, frappes lourdes." },
];

const COLORS = [
  { id: "#ff7700", label: "Gi Orange" },
  { id: "#2563eb", label: "Armure Bleue" },
  { id: "#16a34a", label: "Tunique Verte" },
  { id: "#9333ea", label: "Gi Violet" },
  { id: "#dc2626", label: "Rouge Rubis" },
];

const KEYS: Record<string, keyof GameInput> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  q: "left",
  d: "right",
  " ": "jump",
  j: "punch",
  k: "blast",
  l: "charge",
  t: "transform",
};

export default function DragonPixelGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [style, setStyle] = useState<FighterStyle>("balanced");
  const [color, setColor] = useState("#ff7700");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [hudText, setHudText] = useState("Prêt au combat — 5 vagues d'ennemis.");
  const [statusMessage, setStatusMessage] = useState("");

  const gameStateRef = useRef<GameState>(createGame("balanced"));
  const heldKeysRef = useRef<Set<keyof GameInput>>(new Set());
  const activePointersRef = useRef<Map<number, keyof GameInput>>(new Map());
  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  const drawFighter = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    fighterColor: string,
    transformed: number,
    facing = 1,
  ) => {
    ctx.fillStyle = transformed > 0 ? "#ffd475" : fighterColor;
    if (transformed > 0) {
      ctx.strokeStyle = "#ffd475";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(x, y - 18, 26, 42, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Body & limbs (pixel/retro style)
    ctx.fillRect(x - 10, y - 32, 20, 25);
    ctx.fillRect(x - 9, y - 50, 18, 16);
    ctx.fillRect(x - 13, y - 7, 9, 15);
    ctx.fillRect(x + 4, y - 7, 9, 15);
    ctx.fillRect(x + facing * 15 - 4, y - 30, 8, 18);
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(x + facing * 4 - 2, y - 45, 4, 4);
  };

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, 960, 400);

    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, "#171d43");
    gradient.addColorStop(1, "#24405e");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 960, 400);

    // Sun / Moon in sky
    ctx.fillStyle = "#e9dfb4";
    ctx.beginPath();
    ctx.arc(780, 85, 33, 0, Math.PI * 2);
    ctx.fill();

    // Distant mountains
    ctx.fillStyle = "#18263d";
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 140 - 50, 330);
      ctx.lineTo(i * 140 + 60, 180 + (i % 3) * 30);
      ctx.lineTo(i * 140 + 180, 330);
      ctx.fill();
    }

    // Arena Floor
    ctx.fillStyle = "#35475f";
    ctx.fillRect(0, 328, 960, 72);
    ctx.fillStyle = "#80a5b2";
    ctx.fillRect(0, 328, 960, 4);

    const game = gameStateRef.current;
    const p = game.player;

    // Player
    drawFighter(ctx, p.x, p.y, color, p.transformed, p.facing);

    // Enemies
    for (const e of game.enemies) {
      drawFighter(ctx, e.x, e.y, "#fc8b9c", 0, Math.sign(p.x - e.x) || -1);
      // Health bar above enemy
      ctx.fillStyle = "#fc8b9c";
      const barWidth = Math.max(0, (40 * e.hp) / (35 + game.wave * 8));
      ctx.fillRect(e.x - 20, e.y - 65, barWidth, 4);
    }

    // Ki Blasts
    ctx.fillStyle = "#77f3ff";
    for (const s of game.shots) {
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, 15, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [color]);

  const loop = useCallback(
    (now: number) => {
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = now;

      if (isPlaying && !isPaused) {
        const input: GameInput = {};
        for (const action of heldKeysRef.current) input[action] = true;
        for (const action of activePointersRef.current.values()) input[action] = true;

        step(gameStateRef.current, input, dt);
        const game = gameStateRef.current;

        if (game.status !== "playing") {
          setIsPlaying(false);
          heldKeysRef.current.clear();
          activePointersRef.current.clear();
          setStatusMessage(
            game.status === "won"
              ? `🏆 Victoire ! Les cinq vagues sont vaincues. Score final : ${game.score} !`
              : `💀 Défaite. Score : ${game.score}. Réessaie en changeant de style !`,
          );
        }
      }

      const p = gameStateRef.current.player;
      setHudText(
        `Vie: ${Math.ceil(p.hp)}/100 · Ki: ${Math.floor(p.energy)}/100 · Vague: ${gameStateRef.current.wave}/5 · Score: ${gameStateRef.current.score}${p.transformed > 0 ? " · ⚡ Transformation Active" : ""}`,
      );

      renderCanvas();
      animationFrameRef.current = requestAnimationFrame(loop);
    },
    [isPlaying, isPaused, renderCanvas],
  );

  useEffect(() => {
    lastTimeRef.current = performance.now();
    animationFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [loop]);

  const startGame = () => {
    gameStateRef.current = createGame(style);
    setIsPlaying(true);
    setIsPaused(false);
    setStatusMessage("Combat en cours !");
    heldKeysRef.current.clear();
    activePointersRef.current.clear();
  };

  const togglePause = () => {
    if (!isPlaying) return;
    setIsPaused((prev) => {
      const next = !prev;
      setStatusMessage(next ? "Partie en pause." : "Combat repris.");
      heldKeysRef.current.clear();
      activePointersRef.current.clear();
      return next;
    });
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (["INPUT", "SELECT", "BUTTON"].includes((e.target as HTMLElement).tagName)) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const action = KEYS[key];
      if (action) {
        e.preventDefault();
        heldKeysRef.current.add(action);
      }
      if (key === "p" && isPlaying) {
        togglePause();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const action = KEYS[key];
      if (action) {
        heldKeysRef.current.delete(action);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isPlaying]);

  return (
    <div className="flex flex-col gap-6">
      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/40 p-4 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-white/80">
            <span>Style :</span>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value as FighterStyle)}
              disabled={isPlaying}
              className="rounded-lg border border-white/15 bg-zinc-900 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              {STYLES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm font-semibold text-white/80">
            <span>Gi :</span>
            <select
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="rounded-lg border border-white/15 bg-zinc-900 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              {COLORS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={startGame}
            className="rounded-lg bg-amber-600 px-5 py-2 font-display text-sm font-bold uppercase tracking-wider text-white shadow-lg transition hover:bg-amber-500 active:scale-95"
          >
            {isPlaying ? "Recommencer" : "Lancer le combat"}
          </button>
          {isPlaying && (
            <button
              type="button"
              onClick={togglePause}
              className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 font-display text-sm font-bold text-white transition hover:bg-white/20 active:scale-95"
            >
              {isPaused ? "Reprendre" : "Pause"}
            </button>
          )}
        </div>
      </div>

      {/* Game HUD */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-900/80 px-4 py-2 font-mono text-sm text-amber-300">
        <div>{hudText}</div>
        {statusMessage && <div className="font-bold text-white">{statusMessage}</div>}
      </div>

      {/* Canvas Arena */}
      <div className="relative aspect-[960/400] w-full overflow-hidden rounded-xl border border-white/10 shadow-2xl">
        <canvas
          ref={canvasRef}
          width={960}
          height={400}
          className="h-full w-full object-contain"
        />
      </div>

      {/* Touch / Mouse Action Buttons */}
      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onPointerDown={() => heldKeysRef.current.add("left")}
          onPointerUp={() => heldKeysRef.current.delete("left")}
          onPointerLeave={() => heldKeysRef.current.delete("left")}
          className="rounded-lg bg-white/10 px-4 py-3 font-mono font-bold text-white active:bg-white/25 sm:px-6"
        >
          ← Gauche (Q)
        </button>
        <button
          type="button"
          onPointerDown={() => heldKeysRef.current.add("right")}
          onPointerUp={() => heldKeysRef.current.delete("right")}
          onPointerLeave={() => heldKeysRef.current.delete("right")}
          className="rounded-lg bg-white/10 px-4 py-3 font-mono font-bold text-white active:bg-white/25 sm:px-6"
        >
          Droite (D) →
        </button>
        <button
          type="button"
          onPointerDown={() => heldKeysRef.current.add("jump")}
          onPointerUp={() => heldKeysRef.current.delete("jump")}
          onPointerLeave={() => heldKeysRef.current.delete("jump")}
          className="rounded-lg bg-white/10 px-4 py-3 font-mono font-bold text-white active:bg-white/25 sm:px-6"
        >
          Saut (Espace)
        </button>
        <button
          type="button"
          onPointerDown={() => heldKeysRef.current.add("punch")}
          onPointerUp={() => heldKeysRef.current.delete("punch")}
          onPointerLeave={() => heldKeysRef.current.delete("punch")}
          className="rounded-lg bg-red-600/80 px-4 py-3 font-mono font-bold text-white active:bg-red-500 sm:px-6"
        >
          Poing (J)
        </button>
        <button
          type="button"
          onPointerDown={() => heldKeysRef.current.add("blast")}
          onPointerUp={() => heldKeysRef.current.delete("blast")}
          onPointerLeave={() => heldKeysRef.current.delete("blast")}
          className="rounded-lg bg-cyan-600/80 px-4 py-3 font-mono font-bold text-white active:bg-cyan-500 sm:px-6"
        >
          Kikoha (K)
        </button>
        <button
          type="button"
          onPointerDown={() => heldKeysRef.current.add("charge")}
          onPointerUp={() => heldKeysRef.current.delete("charge")}
          onPointerLeave={() => heldKeysRef.current.delete("charge")}
          className="rounded-lg bg-amber-600/80 px-4 py-3 font-mono font-bold text-white active:bg-amber-500 sm:px-6"
        >
          Charger Ki (L)
        </button>
        <button
          type="button"
          onPointerDown={() => heldKeysRef.current.add("transform")}
          onPointerUp={() => heldKeysRef.current.delete("transform")}
          onPointerLeave={() => heldKeysRef.current.delete("transform")}
          className="rounded-lg bg-yellow-500/80 px-4 py-3 font-mono font-bold text-black active:bg-yellow-400 sm:px-6"
        >
          Transformation (T)
        </button>
      </div>

      {/* Guide section */}
      <section className="rounded-xl border border-white/10 bg-black/30 p-5 text-sm leading-relaxed text-white/70">
        <h3 className="mb-2 font-display text-lg font-bold text-white">Instructions & Raccourcis</h3>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
          <li>• <strong>Déplacement :</strong> Q / D ou Flèches Gauche / Droite</li>
          <li>• <strong>Saut :</strong> Espace</li>
          <li>• <strong>Attaque de mêlée :</strong> Touche J (enchaîne des combos)</li>
          <li>• <strong>Kikoha / Projectile :</strong> Touche K (coûte 20 Ki)</li>
          <li>• <strong>Charge de Ki :</strong> Touche L (maintiens pour monter à 100)</li>
          <li>• <strong>Super Transformation :</strong> Touche T (nécessite 80 Ki)</li>
          <li>• <strong>Pause :</strong> Touche P</li>
          <li>• <strong>Objectif :</strong> Vaincre les 5 vagues successives d'adversaires !</li>
        </ul>
      </section>
    </div>
  );
}
