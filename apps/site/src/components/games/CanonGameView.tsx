// SPDX-License-Identifier: Apache-2.0
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import {
  BookOpen,
  Clapperboard,
  Expand,
  Flame,
  Gamepad2,
  Info,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Swords,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  CanonGameEngine,
  type RenderMode,
  getCanonStoryManifest,
  getCanonChapter,
  computeCanonPowerMultiplier,
  formatMangaDialogues,
  type CanonChapter,
  type CanonSaga,
} from "@aphrody/shenron-engine";
import { FighterzHpBar, DragonRadarHud } from "@aphrody/shenron-ui/games";

export function CanonGameView({ initialChapterId = 6 }: { initialChapterId?: number }) {
  const [currentChapterId, setCurrentChapterId] = useState(initialChapterId);
  const [renderMode, setRenderMode] = useState<RenderMode>("2.5d_webgpu");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showLore, setShowLore] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<CanonGameEngine | null>(null);
  const keysRef = useRef<{
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
    lightAttack: boolean;
    heavyAttack: boolean;
    kiBlast: boolean;
    superMove: boolean;
    summonShenron: boolean;
  }>({
    left: false,
    right: false,
    up: false,
    down: false,
    lightAttack: false,
    heavyAttack: false,
    kiBlast: false,
    superMove: false,
    summonShenron: false,
  });

  const manifest = getCanonStoryManifest();
  const currentChapter = getCanonChapter(currentChapterId) ?? manifest.chapters[0];

  const [gameState, setGameState] = useState<{
    playerHp: number;
    playerMaxHp: number;
    playerKi: number;
    enemyHp: number;
    enemyMaxHp: number;
    enemyKi: number;
    comboCount: number;
    comboDamage: number;
    matchState: "intro" | "fighting" | "beam_clash" | "victory" | "defeat";
    beamClashActive: boolean;
    beamClashP1: number;
    dragonBalls: number;
    shenronSummoned: boolean;
    dramaticFinish: boolean;
  }>({
    playerHp: 100,
    playerMaxHp: 100,
    playerKi: 100,
    enemyHp: currentChapter.enemy.boss_hp ?? 150,
    enemyMaxHp: currentChapter.enemy.boss_hp ?? 150,
    enemyKi: 100,
    comboCount: 0,
    comboDamage: 0,
    matchState: "intro",
    beamClashActive: false,
    beamClashP1: 50,
    dragonBalls: 0,
    shenronSummoned: false,
    dramaticFinish: false,
  });

  // Initialize or update the engine when chapter changes
  useEffect(() => {
    const engine = new CanonGameEngine({
      chapter: currentChapter,
      renderMode,
      audioEnabled: soundEnabled,
    });
    engineRef.current = engine;

    setGameState({
      playerHp: engine.player.hp,
      playerMaxHp: engine.player.maxHp,
      playerKi: engine.player.ki,
      enemyHp: engine.enemy.hp,
      enemyMaxHp: engine.enemy.maxHp,
      enemyKi: engine.enemy.ki,
      comboCount: 0,
      comboDamage: 0,
      matchState: "intro",
      beamClashActive: false,
      beamClashP1: 50,
      dragonBalls: 0,
      shenronSummoned: false,
      dramaticFinish: false,
    });
  }, [currentChapter, renderMode, soundEnabled]);

  // Main 60 FPS Render & Simulation Loop
  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let lastTime = performance.now();

    const loop = (now: number) => {
      animId = requestAnimationFrame(loop);
      const delta = now - lastTime;
      if (delta < 14) return; // Cap at ~60-70 FPS
      lastTime = now;

      const engine = engineRef.current;
      if (!engine) return;

      // Tick simulation
      engine.tick(keysRef.current);

      // Reset single-frame triggers
      keysRef.current.lightAttack = false;
      keysRef.current.heavyAttack = false;
      keysRef.current.kiBlast = false;
      keysRef.current.superMove = false;
      keysRef.current.summonShenron = false;

      // Sync state for UI rendering
      setGameState({
        playerHp: engine.player.hp,
        playerMaxHp: engine.player.maxHp,
        playerKi: engine.player.ki,
        enemyHp: engine.enemy.hp,
        enemyMaxHp: engine.enemy.maxHp,
        enemyKi: engine.enemy.ki,
        comboCount: engine.player.comboCount,
        comboDamage: engine.player.comboDamage,
        matchState: engine.matchState,
        beamClashActive: engine.beamClash.active,
        beamClashP1: engine.beamClash.p1Energy,
        dragonBalls: engine.dragonBallsCollected,
        shenronSummoned: engine.shenronSummoned,
        dramaticFinish: engine.dramaticFinishTriggered,
      });

      // Canvas Rendering
      renderCanvasFrame(ctx, canvas.width, canvas.height, engine);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Keyboard Event Handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const k = keysRef.current;
      if (e.code === "KeyA" || e.code === "ArrowLeft") k.left = true;
      if (e.code === "KeyD" || e.code === "ArrowRight") k.right = true;
      if (e.code === "KeyW" || e.code === "ArrowUp" || e.code === "Space") k.up = true;
      if (e.code === "KeyS" || e.code === "ArrowDown") k.down = true;
      if (e.code === "KeyJ") k.lightAttack = true;
      if (e.code === "KeyK") k.heavyAttack = true;
      if (e.code === "KeyL") k.kiBlast = true;
      if (e.code === "KeyU") k.superMove = true;
      if (e.code === "KeyI") k.summonShenron = true;
      if (e.code === "KeyF") toggleFullscreen();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const k = keysRef.current;
      if (e.code === "KeyA" || e.code === "ArrowLeft") k.left = false;
      if (e.code === "KeyD" || e.code === "ArrowRight") k.right = false;
      if (e.code === "KeyW" || e.code === "ArrowUp" || e.code === "Space") k.up = false;
      if (e.code === "KeyS" || e.code === "ArrowDown") k.down = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      void containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      void document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const startFight = () => {
    if (engineRef.current) {
      engineRef.current.matchState = "fighting";
    }
  };

  const restartFight = () => {
    if (engineRef.current) {
      const engine = new CanonGameEngine({
        chapter: currentChapter,
        renderMode,
        audioEnabled: soundEnabled,
      });
      engine.matchState = "fighting";
      engineRef.current = engine;
    }
  };

  const powerStats = computeCanonPowerMultiplier(
    currentChapter.player.power_level,
    currentChapter.enemy.power_level,
  );

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col w-full max-w-7xl mx-auto rounded-3xl overflow-hidden border border-white/10 bg-[#090d16] text-white shadow-2xl select-none"
    >
      {/* Top Gaming Bar */}
      <header className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-b border-white/10 bg-slate-950/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-mono font-bold border border-emerald-500/30">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            60 FPS • WebGPU
          </span>
          <span className="text-sm font-bold text-amber-400 tracking-tight">
            {currentChapter.title}
          </span>
          <span className="hidden md:inline text-xs text-white/50 font-mono">
            {currentChapter.title_ja}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Render Mode Toggle */}
          <button
            type="button"
            onClick={() => setRenderMode(renderMode === "2.5d_webgpu" ? "2d_pixel" : "2.5d_webgpu")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 text-xs font-mono transition-colors"
          >
            <Sparkles className="size-3.5 text-sky-400" />
            {renderMode === "2.5d_webgpu" ? "2.5D Cel-Shaded" : "2D Pixel Retro"}
          </button>

          {/* Sound Toggle */}
          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-white/80 transition-colors"
            title={soundEnabled ? "Couper le son" : "Activer le son"}
          >
            {soundEnabled ? (
              <Volume2 className="size-4" />
            ) : (
              <VolumeX className="size-4 text-red-400" />
            )}
          </button>

          {/* Lore / Databooks Toggle */}
          <button
            type="button"
            onClick={() => setShowLore(!showLore)}
            className={`p-2 rounded-lg border transition-colors ${
              showLore
                ? "border-amber-500 bg-amber-500/20 text-amber-300"
                : "border-white/10 bg-white/5 hover:bg-white/10 text-white/80"
            }`}
            title="Dossier Canon, Manga & Databooks"
          >
            <BookOpen className="size-4" />
          </button>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-white/80 transition-colors"
            title="Plein écran (Touche F)"
          >
            {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
        </div>
      </header>

      {/* FighterZ HUD Layer */}
      <div className="relative w-full aspect-[16/9] min-h-[480px] bg-black overflow-hidden flex flex-col justify-between">
        {/* Top Health & Timer Bar */}
        <div className="absolute top-0 inset-x-0 z-20 p-4 md:p-6 flex items-start justify-between pointer-events-none">
          {/* P1 HP Bar */}
          <div className="flex flex-col gap-1 w-5/12 max-w-md">
            <FighterzHpBar
              fighterName={currentChapter.player.name}
              activeHp={(gameState.playerHp / gameState.playerMaxHp) * 100}
              recoverableHp={(gameState.playerHp / gameState.playerMaxHp) * 100}
              assistReady={true}
            />
            {/* Ki Super Meter (0..7 Bars) */}
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[11px] font-black text-amber-400 font-mono tracking-widest">
                KI LV.{Math.floor(gameState.playerKi / 100)}
              </span>
              <div className="flex-1 h-2 rounded bg-black/60 border border-white/20 overflow-hidden flex">
                <div
                  className="h-full bg-gradient-to-r from-sky-500 via-amber-400 to-amber-300 transition-all duration-75"
                  style={{ width: `${(gameState.playerKi / 700) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Center Match Objective / Combo / Beam Clash */}
          <div className="flex flex-col items-center justify-center text-center">
            {gameState.beamClashActive ? (
              <div className="px-4 py-2 rounded-xl border border-sky-400/50 bg-sky-950/90 text-sky-200 font-black animate-pulse shadow-lg text-sm md:text-base">
                ⚡ BEAM CLASH ! MITRAILLEZ [J] / [K] ! ⚡
              </div>
            ) : gameState.comboCount > 1 ? (
              <div className="animate-bounce">
                <span className="text-3xl md:text-4xl font-black text-amber-400 italic tracking-tighter drop-shadow-[0_2px_12px_rgba(251,191,36,0.6)]">
                  {gameState.comboCount} HITS !
                </span>
                <p className="text-xs font-bold text-white/80 font-mono">
                  {gameState.comboDamage * 1000} DMG
                </p>
              </div>
            ) : (
              <span className="px-3 py-1 rounded-md bg-black/60 border border-white/10 text-xs font-mono text-zinc-300">
                {currentChapter.arena_name}
              </span>
            )}
          </div>

          {/* Enemy HP Bar */}
          <div className="flex flex-col gap-1 w-5/12 max-w-md items-end">
            <FighterzHpBar
              fighterName={currentChapter.enemy.name}
              activeHp={(gameState.enemyHp / gameState.enemyMaxHp) * 100}
              recoverableHp={(gameState.enemyHp / gameState.enemyMaxHp) * 100}
              assistReady={false}
            />
            {/* Enemy Ki Meter */}
            <div className="flex items-center gap-2 mt-1 w-full justify-end">
              <div className="flex-1 h-2 rounded bg-black/60 border border-white/20 overflow-hidden flex flex-row-reverse">
                <div
                  className="h-full bg-gradient-to-l from-red-500 to-amber-500 transition-all duration-75"
                  style={{ width: `${(gameState.enemyKi / 700) * 100}%` }}
                />
              </div>
              <span className="text-[11px] font-black text-red-400 font-mono tracking-widest">
                KI LV.{Math.floor(gameState.enemyKi / 100)}
              </span>
            </div>
          </div>
        </div>

        {/* The 60 FPS HTML5 Canvas */}
        <canvas ref={canvasRef} width={1280} height={720} className="w-full h-full object-cover" />

        {/* Bottom Radar & Summon Status */}
        <div className="absolute bottom-4 left-6 z-20 flex items-center gap-4 pointer-events-none">
          <DragonRadarHud
            ballsCollected={gameState.dragonBalls}
            shenronReady={gameState.dragonBalls === 7}
          />
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-bold text-emerald-400 tracking-wider uppercase font-mono">
              Dragon Radar : {gameState.dragonBalls}/7 Sphères
            </span>
            <span className="text-[11px] text-white/60">
              {gameState.dragonBalls === 7
                ? "Touche [I] pour exaucer votre vœu à Shenron !"
                : "Enchaînez les combos pour détecter les Dragon Balls"}
            </span>
          </div>
        </div>

        {/* Manga Story Overlay Dialogues (Intro or Victory) */}
        {gameState.matchState === "intro" && (
          <div className="absolute inset-0 z-30 flex items-center justify-center p-6 bg-black/75 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-2xl border-[3px] border-black bg-white text-black p-6 shadow-[8px_8px_0px_#000] relative">
              <div className="flex items-center justify-between pb-3 border-b-2 border-black mb-4">
                <span className="font-black text-sm tracking-wider uppercase bg-amber-400 px-3 py-0.5 border-2 border-black rounded">
                  Chapitre {currentChapter.id} • {currentChapter.saga_id.toUpperCase()}
                </span>
                <span className="text-xs font-mono font-bold text-zinc-600">
                  Tome {currentChapter.tome} — Ch. {currentChapter.manga_chapter}
                </span>
              </div>

              <h2 className="text-2xl font-black mb-4 tracking-tight">{currentChapter.title}</h2>

              <div className="space-y-4 mb-6">
                {formatMangaDialogues(currentChapter.dialogue_intro, "bilingual").map(
                  (d: { speaker: string; content: string; subContent?: string }, i: number) => (
                    <div
                      key={i}
                      className="p-3 rounded-lg border-2 border-black bg-zinc-50 relative"
                    >
                      <span className="font-bold text-xs text-amber-700 block mb-1">
                        {d.speaker}
                      </span>
                      <p className="text-sm font-semibold text-zinc-900 leading-snug">
                        « {d.content} »
                      </p>
                      {d.subContent && (
                        <p className="text-xs text-zinc-500 font-mono mt-1">{d.subContent}</p>
                      )}
                    </div>
                  ),
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t-2 border-black">
                <div className="flex items-center gap-2">
                  <Link
                    href={currentChapter.canon_refs.manga_url}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded border-2 border-black bg-zinc-100 hover:bg-zinc-200 text-xs font-bold text-black transition-colors"
                  >
                    <BookOpen className="size-3.5" />
                    Lire le Manga (p.{currentChapter.page_start})
                  </Link>
                  <Link
                    href={currentChapter.canon_refs.episode_url}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded border-2 border-black bg-zinc-100 hover:bg-zinc-200 text-xs font-bold text-black transition-colors"
                  >
                    <Clapperboard className="size-3.5" />
                    Épisode {currentChapter.canon_refs.episode_id}
                  </Link>
                </div>

                <button
                  type="button"
                  onClick={startFight}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-lg border-2 border-black bg-amber-400 hover:bg-amber-300 text-black font-black text-sm uppercase tracking-wider shadow-[4px_4px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[2px_2px_0px_#000] transition-all"
                >
                  <Swords className="size-4" />
                  Engager le Combat
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Victory Screen / Dramatic Finish */}
        {gameState.matchState === "victory" && (
          <div className="absolute inset-0 z-30 flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
            <div className="w-full max-w-2xl rounded-2xl border-[3px] border-black bg-white text-black p-6 shadow-[10px_10px_0px_#eab308]">
              <div className="flex items-center justify-between pb-3 border-b-2 border-black mb-4">
                <span className="font-black text-sm tracking-wider uppercase bg-emerald-400 px-3 py-0.5 border-2 border-black rounded">
                  VICTOIRE CANONIQUE !
                </span>
                <span className="text-xs font-bold text-amber-600 font-mono">
                  DRAMATIC FINISH : {currentChapter.dramatic_finish.move.toUpperCase()}
                </span>
              </div>

              <h3 className="text-3xl font-black mb-4 text-emerald-600 italic tracking-tight">
                {currentChapter.dialogue_victory[0]?.speaker} Triomphe !
              </h3>

              <div className="p-4 rounded-xl border-2 border-black bg-amber-50 mb-6">
                <p className="text-base font-bold text-zinc-900 leading-relaxed">
                  « {currentChapter.dialogue_victory[0]?.text} »
                </p>
                <p className="text-xs text-zinc-600 font-mono mt-1">
                  {currentChapter.dialogue_victory[0]?.text_ja}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={restartFight}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-black bg-zinc-200 hover:bg-zinc-300 text-black font-bold text-xs"
                >
                  <RotateCcw className="size-3.5" />
                  Rejouer ce Combat
                </button>

                {currentChapterId < manifest.chapters.length && (
                  <button
                    type="button"
                    onClick={() => setCurrentChapterId(currentChapterId + 1)}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-lg border-2 border-black bg-amber-400 hover:bg-amber-300 text-black font-black text-sm uppercase tracking-wider shadow-[4px_4px_0px_#000]"
                  >
                    Chapitre Suivant
                    <Flame className="size-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Defeat Screen */}
        {gameState.matchState === "defeat" && (
          <div className="absolute inset-0 z-30 flex items-center justify-center p-6 bg-black/85 backdrop-blur-md">
            <div className="w-full max-w-md rounded-2xl border-2 border-red-500 bg-zinc-950 p-6 text-center text-white shadow-2xl">
              <h3 className="text-3xl font-black text-red-500 mb-2 italic tracking-tight">
                DÉFAITE...
              </h3>
              <p className="text-sm text-zinc-300 mb-6">
                L'histoire de Dragon Ball a vacillé. Entraînez-vous et retentez votre chance !
              </p>
              <button
                type="button"
                onClick={restartFight}
                className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black uppercase tracking-wider text-sm transition-colors"
              >
                Réessayer le Combat
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Canon Lore & Daizenshuu Panel (Slide-out or Collapsible) */}
      {showLore && (
        <section
          aria-label="Dossier canonique et Daizenshuu"
          className="p-6 border-t border-white/10 bg-slate-950/90 space-y-4 animate-in fade-in"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-white/10">
            <div>
              <span className="text-xs uppercase tracking-widest font-mono text-amber-400 font-bold">
                Archives Daizenshuu 7 & Chouzenshuu 4
              </span>
              <h3 className="text-lg font-bold text-white">
                Analyse Canonique : {currentChapter.player.name} vs {currentChapter.enemy.name}
              </h3>
            </div>

            <div className="flex items-center gap-3 text-xs font-mono text-white/80">
              <span className="px-2.5 py-1 rounded bg-white/5 border border-white/10">
                P1 : {currentChapter.player.power_level.toLocaleString()}
              </span>
              <span className="text-white/40">VS</span>
              <span className="px-2.5 py-1 rounded bg-white/5 border border-white/10">
                BOSS : {currentChapter.enemy.power_level.toLocaleString()}
              </span>
              <span className="px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Ratio Scouter : {powerStats.scouterRatio}x
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-zinc-300">
            <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-2">
              <span className="text-xs font-bold text-amber-400 font-mono uppercase">
                Notice Daizenshuu Officielle
              </span>
              <p className="leading-relaxed">{currentChapter.canon_refs.daizenshuu}</p>
              <p className="text-xs text-zinc-500 font-mono">
                Lot d'extraction OCR : {currentChapter.canon_refs.databook_lot}
              </p>
            </div>

            <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-2">
              <span className="text-xs font-bold text-sky-400 font-mono uppercase">
                Correspondances Monorepo & Streaming
              </span>
              <ul className="space-y-1 text-xs text-zinc-400 font-mono">
                <li>
                  • Manga : Tome {currentChapter.tome}, Chapitre {currentChapter.manga_chapter} (p.
                  {currentChapter.page_start})
                </li>
                <li>• Épisode Anime : {currentChapter.canon_refs.episode_id}</li>
                <li>• Technique Signature : {currentChapter.canon_refs.technique_slug}</li>
                <li>
                  • Arène : {currentChapter.arena_name} ({currentChapter.arena_id})
                </li>
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* Saga & Battle Carousel */}
      <nav
        aria-label="Sélection des sagas canoniques"
        className="p-4 border-t border-white/10 bg-slate-950 overflow-x-auto flex items-center gap-3 no-scrollbar"
      >
        {manifest.chapters.map((ch: CanonChapter) => {
          const isSelected = ch.id === currentChapterId;
          return (
            <button
              key={ch.id}
              type="button"
              onClick={() => setCurrentChapterId(ch.id)}
              className={`shrink-0 flex items-center gap-2.5 px-4 py-2 rounded-xl border text-xs font-mono transition-all ${
                isSelected
                  ? "border-amber-400 bg-amber-400/20 text-white font-bold shadow-lg"
                  : "border-white/10 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white"
              }`}
            >
              <span
                className={`size-2 rounded-full ${isSelected ? "bg-amber-400" : "bg-zinc-600"}`}
              />
              <span>
                Ch.{ch.id} : {ch.title.split(":")[0]}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Bottom Controls Legend */}
      <footer className="px-6 py-3 border-t border-white/5 bg-slate-950/60 flex flex-wrap items-center justify-between text-xs text-white/50 font-mono">
        <div className="flex flex-wrap items-center gap-4">
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white font-bold">A/D</kbd>{" "}
            Déplacement
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white font-bold">W</kbd> Saut
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white font-bold">J</kbd> Attaque
            Légère
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white font-bold">K</kbd> Coup
            Lourd
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white font-bold">L</kbd> Vague
            Kikō
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white font-bold">U</kbd> Super
            Rayon (100 Ki)
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white font-bold">I</kbd> Invoquer
            Shenron (7 Sphères)
          </span>
        </div>
        <span>Akira Toriyama • Bird Studio / Shueisha • DBFR Sovereign Engine</span>
      </footer>
    </div>
  );
}

/**
 * 60 FPS HTML5 Canvas Drawing Pipeline
 */
function renderCanvasFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  engine: CanonGameEngine,
) {
  // Clear
  ctx.save();
  ctx.clearRect(0, 0, w, h);

  // Camera transform + screen shake
  ctx.translate(w / 2, h / 2 + 120);
  if (engine.camera.shake > 0) {
    const rx = (Math.random() - 0.5) * engine.camera.shake * 4;
    const ry = (Math.random() - 0.5) * engine.camera.shake * 4;
    ctx.translate(rx, ry);
  }

  // Draw Arena Floor & Horizon
  const arenaGrad = ctx.createLinearGradient(0, -300, 0, 100);
  if (engine.chapter.arena_id === "namek_destruction") {
    arenaGrad.addColorStop(0, "#450a0a");
    arenaGrad.addColorStop(0.6, "#7f1d1d");
    arenaGrad.addColorStop(1, "#1c1917");
  } else if (engine.chapter.arena_id === "tenkaichi") {
    arenaGrad.addColorStop(0, "#0284c7");
    arenaGrad.addColorStop(0.7, "#38bdf8");
    arenaGrad.addColorStop(1, "#78716c");
  } else {
    arenaGrad.addColorStop(0, "#0f172a");
    arenaGrad.addColorStop(0.7, "#1e293b");
    arenaGrad.addColorStop(1, "#334155");
  }

  // Sky backdrop
  ctx.fillStyle = arenaGrad;
  ctx.fillRect(-w / 2 - 50, -h / 2 - 200, w + 100, h);

  // Ground plane
  ctx.fillStyle = engine.chapter.arena_id === "namek_destruction" ? "#292524" : "#475569";
  ctx.fillRect(-w / 2 - 50, 0, w + 100, 200);

  // Ground edge line
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-w / 2 - 50, 0);
  ctx.lineTo(w / 2 + 50, 0);
  ctx.stroke();

  // Speedlines if beam special or beam clash
  if (
    engine.player.state === "beam_special" ||
    engine.enemy.state === "beam_special" ||
    engine.beamClash.active
  ) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 15; i++) {
      const y = -250 + Math.random() * 300;
      ctx.beginPath();
      ctx.moveTo(-w / 2, y);
      ctx.lineTo(w / 2, y);
      ctx.stroke();
    }
  }

  // Draw Player Fighter
  drawFighter(ctx, engine.player, "#38bdf8", true);

  // Draw Enemy Fighter
  drawFighter(ctx, engine.enemy, "#ef4444", false);

  // Draw Beam Clash if active
  if (engine.beamClash.active) {
    drawBeamClash(ctx, engine);
  }

  // Draw Particles & Sparks
  for (const p of engine.particles) {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw Manga Katakana Onomatopoeia
  for (const o of engine.onomatopoeias) {
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.scale(o.scale, o.scale);
    ctx.font = "bold 26px sans-serif";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#000000";
    ctx.strokeText(o.text, -40, 0);
    ctx.fillStyle = o.color;
    ctx.fillText(o.text, -40, 0);
    ctx.restore();
  }

  ctx.restore();
}

function drawFighter(
  ctx: CanvasRenderingContext2D,
  f: CanonGameEngine["player"],
  color: string,
  isPlayer: boolean,
) {
  ctx.save();
  ctx.translate(f.x, f.y);

  // Fighter Shadow
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.beginPath();
  ctx.ellipse(0, 0, 32, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  // Draw Toriyama Silhouette & Aura
  if (f.state === "beam_special") {
    // Aura glow
    ctx.fillStyle = isPlayer ? "rgba(56, 189, 248, 0.3)" : "rgba(239, 68, 68, 0.3)";
    ctx.beginPath();
    ctx.arc(0, -50, 60, 0, Math.PI * 2);
    ctx.fill();
  }

  // Body representation (ArcSys Toon Cel Silhouette)
  const dir = f.facingRight ? 1 : -1;
  ctx.scale(dir, 1);

  // Inverted hull outline
  ctx.strokeStyle = "#09090b";
  ctx.lineWidth = 4;

  // Legs
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(-18, -35, 14, 35);
  ctx.strokeRect(-18, -35, 14, 35);
  ctx.fillRect(4, -35, 14, 35);
  ctx.strokeRect(4, -35, 14, 35);

  // Gi / Torso
  ctx.fillStyle = isPlayer ? "#ea580c" : "#7c3aed"; // Goku Orange vs Vegeta / Frieza Purple
  ctx.fillRect(-16, -75, 32, 42);
  ctx.strokeRect(-16, -75, 32, 42);

  // Belt / Obi
  ctx.fillStyle = "#1e3a8a";
  ctx.fillRect(-18, -48, 36, 10);
  ctx.strokeRect(-18, -48, 36, 10);

  // Head & Hair
  ctx.fillStyle = "#fed7aa"; // Skin tone
  ctx.beginPath();
  ctx.arc(0, -88, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Saiyan Hair spikes
  ctx.fillStyle = f.transformationLevel > 0 ? "#facc15" : "#09090b"; // SSJ Gold vs Black
  ctx.beginPath();
  ctx.moveTo(-16, -92);
  ctx.lineTo(-26, -120);
  ctx.lineTo(-6, -104);
  ctx.lineTo(0, -128);
  ctx.lineTo(8, -104);
  ctx.lineTo(24, -118);
  ctx.lineTo(16, -92);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Attack arm extension
  if (f.state === "attack_light" || f.state === "attack_heavy") {
    ctx.fillStyle = "#fed7aa";
    ctx.fillRect(10, -68, 34, 12);
    ctx.strokeRect(10, -68, 34, 12);
  }

  // Beam charge hands
  if (f.state === "beam_special") {
    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.arc(35, -55, 20, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawBeamClash(ctx: CanvasRenderingContext2D, engine: CanonGameEngine) {
  const clash = engine.beamClash;
  const p1 = engine.player;
  const e = engine.enemy;

  // Blue Beam from P1 to Clash center
  const beamP1 = ctx.createLinearGradient(p1.x, p1.y - 50, clash.clashX, clash.clashY);
  beamP1.addColorStop(0, "rgba(56, 189, 248, 0.9)");
  beamP1.addColorStop(1, "rgba(255, 255, 255, 1.0)");
  ctx.strokeStyle = beamP1;
  ctx.lineWidth = 32;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y - 50);
  ctx.lineTo(clash.clashX, clash.clashY);
  ctx.stroke();

  // Red/Purple Beam from Enemy to Clash center
  const beamP2 = ctx.createLinearGradient(e.x, e.y - 50, clash.clashX, clash.clashY);
  beamP2.addColorStop(0, "rgba(239, 68, 68, 0.9)");
  beamP2.addColorStop(1, "rgba(255, 255, 255, 1.0)");
  ctx.strokeStyle = beamP2;
  ctx.lineWidth = 32;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(e.x, e.y - 50);
  ctx.lineTo(clash.clashX, clash.clashY);
  ctx.stroke();

  // Clash Sphere Core
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(clash.clashX, clash.clashY, 28, 0, Math.PI * 2);
  ctx.fill();

  // Expanding shockwave ring
  ctx.strokeStyle = "#fef08a";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(clash.clashX, clash.clashY, 44 + Math.sin(engine.frameCount * 0.3) * 10, 0, Math.PI * 2);
  ctx.stroke();
}
