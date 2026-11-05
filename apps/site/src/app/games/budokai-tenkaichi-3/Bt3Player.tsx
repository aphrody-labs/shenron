"use client";
// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState, useCallback, type ChangeEvent } from "react";
import {
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  RotateCcw,
  Gamepad,
  ArrowLeft,
  Disc,
} from "lucide-react";
import Link from "next/link";
import { GECKO_WASM } from "@/lib/gecko-wasm.generated";

const CHUNK_BYTES = 8 * 1024 * 1024;
const DEFAULT_DISC_URL = "/cdn/shenron/games/budokai-tenkaichi-3-eu.rvz";

interface GeckoModule {
  default(input: { module_or_path: string }): Promise<unknown>;
  begin_game_load(filename: string, expectedSize: number): void;
  append_game_chunk(chunk: Uint8Array): void;
  cancel_game_load(): void;
  prepare_audio(): void;
  start_loaded_game_with_ipl(ipl?: Uint8Array | null): void;
  start_emulator(rom: Uint8Array, filename: string, dspIrom?: Uint8Array | null): void;
}

function wasmUrl(path: string): string {
  const cdn = process.env.NEXT_PUBLIC_CDN_URL?.trim().replace(/\/+$/, "");
  return process.env.NODE_ENV === "production" && cdn ? `${cdn}/assets/${path}` : `/wasm/${path}`;
}

export default function Bt3Player() {
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("Initialisation du moteur Wii…");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showControlsHelp, setShowControlsHelp] = useState(false);
  const [showHud, setShowHud] = useState(true);
  const hideHudTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const geckoModuleRef = useRef<GeckoModule | null>(null);
  const isStartedRef = useRef(false);

  // Auto-hide HUD on idle
  const handleMouseMove = useCallback(() => {
    setShowHud(true);
    if (hideHudTimer.current) clearTimeout(hideHudTimer.current);
    hideHudTimer.current = setTimeout(() => {
      if (running) setShowHud(false);
    }, 2500);
  }, [running]);

  // Fullscreen management
  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await (containerRef.current?.requestFullscreen() ||
          document.documentElement.requestFullscreen());
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (e) {
      console.warn("Fullscreen toggle error:", e);
    }
  }, []);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "f" || e.key === "F") {
        if (document.activeElement?.tagName !== "INPUT") {
          e.preventDefault();
          toggleFullscreen();
        }
      }
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("fullscreenchange", handleFsChange);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [toggleFullscreen]);

  // Play real Wii sound effect
  const playWiiSfx = (sound: "select" | "hover" | "startup") => {
    try {
      const audio = new Audio(
        `/wii/audio/${sound === "startup" ? "startup.mp3" : sound === "hover" ? "button-hover.mp3" : "button-select.mp3"}`,
      );
      audio.volume = 0.6;
      audio.play().catch(() => {});
    } catch {}
  };

  // Adopt emulator canvas into our fullscreen frame
  const adoptCanvas = (known: Set<Element>) => {
    const target = frameRef.current;
    if (!target) return;
    const started = performance.now();
    const look = () => {
      const canvas = [...document.querySelectorAll("canvas")].find(
        (c) => !known.has(c) && !target.contains(c),
      );
      if (canvas) {
        canvas.style.cssText =
          "width: 100%; height: 100%; object-fit: contain; display: block; image-rendering: pixelated; outline: none; background: #000;";
        target.replaceChildren(canvas);
        canvas.focus();
      } else if (performance.now() - started < 12_000) {
        requestAnimationFrame(look);
      }
    };
    look();
  };

  // Pre-load WASM & start streaming game immediately
  useEffect(() => {
    let active = true;

    async function preloadAndBoot() {
      try {
        setStatusText("Pré-chargement du moteur Gecko WebGPU…");
        const mod = (await import(
          /* webpackIgnore: true */ wasmUrl(GECKO_WASM.js)
        )) as unknown as GeckoModule;
        await mod.default({ module_or_path: wasmUrl(GECKO_WASM.wasm) });
        if (!active) return;
        geckoModuleRef.current = mod;

        // Try pre-streaming disc from CDN
        setStatusText("Connexion au disque Dragon Ball Z : Budokai Tenkaichi 3…");
        const headRes = await fetch(DEFAULT_DISC_URL, { method: "HEAD" }).catch(() => null);

        if (headRes && headRes.ok) {
          const totalBytes = Number(headRes.headers.get("content-length") || 2276009944);
          mod.begin_game_load("budokai-tenkaichi-3-eu.rvz", totalBytes);

          // Stream chunks
          const res = await fetch(DEFAULT_DISC_URL);
          if (!res.body) throw new Error("Flux réseau indisponible");
          const reader = res.body.getReader();
          let loaded = 0;
          let buffer = new Uint8Array(CHUNK_BYTES);
          let bufPos = 0;

          while (active) {
            const { done, value } = await reader.read();
            if (done) {
              if (bufPos > 0) {
                mod.append_game_chunk(buffer.slice(0, bufPos));
              }
              break;
            }
            loaded += value.length;
            setProgress(Math.min(100, Math.round((loaded / totalBytes) * 100)));
            setStatusText(`Pré-chargement du disque Wii… ${Math.round(loaded / (1024 * 1024))} Mo`);

            let valOffset = 0;
            while (valOffset < value.length) {
              const toCopy = Math.min(value.length - valOffset, CHUNK_BYTES - bufPos);
              buffer.set(value.subarray(valOffset, valOffset + toCopy), bufPos);
              bufPos += toCopy;
              valOffset += toCopy;
              if (bufPos === CHUNK_BYTES) {
                mod.append_game_chunk(buffer);
                bufPos = 0;
              }
            }
          }

          if (active) {
            setStatusText("Démarrage instantané…");
            const known = new Set(document.querySelectorAll("canvas"));
            try {
              mod.prepare_audio();
            } catch {}
            mod.start_loaded_game_with_ipl(undefined);
            adoptCanvas(known);
            setLoading(false);
            setRunning(true);
            isStartedRef.current = true;
          }
        } else {
          // If remote disc not found directly, ready for 1-click or local file
          setLoading(false);
          setStatusText("Prêt à démarrer");
        }
      } catch (err) {
        console.warn("Auto-stream error, falling back to local loader:", err);
        setLoading(false);
        setStatusText("Prêt à démarrer");
      }
    }

    preloadAndBoot();

    return () => {
      active = false;
      try {
        geckoModuleRef.current?.cancel_game_load();
      } catch {}
    };
  }, []);

  // Local file selection or drag and drop
  const handleLocalFile = async (file: File) => {
    if (!geckoModuleRef.current) return;
    setLoading(true);
    setStatusText(`Chargement de ${file.name}…`);
    const mod = geckoModuleRef.current;
    const known = new Set(document.querySelectorAll("canvas"));

    try {
      try {
        mod.prepare_audio();
      } catch {}
      if (file.name.toLowerCase().endsWith(".rvz")) {
        mod.begin_game_load(file.name, file.size);
        for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
          const end = Math.min(offset + CHUNK_BYTES, file.size);
          const chunk = new Uint8Array(await file.slice(offset, end).arrayBuffer());
          mod.append_game_chunk(chunk);
          setProgress(Math.round((end / file.size) * 100));
        }
        mod.start_loaded_game_with_ipl(undefined);
      } else {
        const buf = new Uint8Array(await file.arrayBuffer());
        mod.start_emulator(buf, file.name, undefined);
      }
      adoptCanvas(known);
      setLoading(false);
      setRunning(true);
      isStartedRef.current = true;
    } catch (e) {
      console.error(e);
      setLoading(false);
      setStatusText("Erreur au chargement du disque.");
    }
  };

  const onFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleLocalFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleLocalFile(f);
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black text-white"
      style={{ cursor: showHud ? "default" : "none" }}
    >
      {/* Hidden local disc picker */}
      <input
        ref={inputRef}
        type="file"
        accept=".rvz,.iso,.dol"
        onChange={onFileInputChange}
        className="hidden"
      />

      {/* Main Game Screen Canvas Container (True 16:9 / 4:3 fit, pure black background) */}
      <div
        ref={frameRef}
        className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black"
      >
        {/* Pre-launch / Loading State */}
        {!running && (
          <div className="relative z-10 flex flex-col items-center justify-center gap-6 p-8 text-center max-w-lg">
            {/* Real Wii Channel Disc Art / Title */}
            <div className="relative group">
              <img
                src="/wii/bt3-title.png"
                alt="Dragon Ball Z : Budokai Tenkaichi 3"
                className="max-h-56 max-w-full rounded-lg shadow-2xl border border-white/20 object-contain transition-transform duration-300 group-hover:scale-105"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            </div>

            <h1 className="text-2xl font-bold tracking-wide text-amber-400 drop-shadow-md">
              Dragon Ball Z : Budokai Tenkaichi 3
            </h1>

            {loading ? (
              <div className="flex flex-col items-center gap-3 w-72">
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800 border border-slate-700">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-200"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-xs text-slate-300 animate-pulse">{statusText}</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <button
                  type="button"
                  onClick={() => {
                    playWiiSfx("startup");
                    toggleFullscreen();
                  }}
                  onMouseEnter={() => playWiiSfx("hover")}
                  className="inline-flex items-center gap-2 rounded-full bg-amber-500 hover:bg-amber-400 px-8 py-3 text-lg font-bold text-black shadow-lg transition-transform active:scale-95"
                >
                  <Disc className="h-6 w-6 animate-spin" />
                  Démarrer en plein écran
                </button>

                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="text-xs text-slate-400 hover:text-white underline underline-offset-4"
                >
                  Charger un disque local (.rvz, .iso)
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating Auto-Hiding Controls Bar */}
      <aside
        aria-label="Contrôles du jeu"
        className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded-full border border-white/10 bg-black/75 px-4 py-2 backdrop-blur-md transition-opacity duration-300 ${
          showHud ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      >
        <button
          type="button"
          onClick={() => setShowControlsHelp(!showControlsHelp)}
          title="Commandes &amp; Manette"
          className="rounded-full p-2 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
        >
          <Gamepad className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={() => setMuted(!muted)}
          title={muted ? "Activer le son" : "Couper le son"}
          className="rounded-full p-2 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
        >
          {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>

        <button
          type="button"
          onClick={() => {
            playWiiSfx("select");
            toggleFullscreen();
          }}
          title={isFullscreen ? "Quitter le plein écran (F)" : "Plein écran (F)"}
          className="rounded-full p-2 text-amber-400 hover:bg-white/10 hover:text-amber-300 transition-colors"
        >
          {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
        </button>

        <button
          type="button"
          onClick={() => window.location.reload()}
          title="Redémarrer"
          className="rounded-full p-2 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
        >
          <RotateCcw className="h-5 w-5" />
        </button>

        <Link
          href="/games"
          title="Retour aux jeux"
          className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-red-400 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
      </aside>

      {/* Discreet Controls Popover */}
      {showControlsHelp && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl border border-white/15 bg-black/90 p-5 text-sm backdrop-blur-lg shadow-2xl max-w-xs animate-in fade-in">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
            <span className="font-bold text-amber-400">Contrôles Wii &amp; Clavier</span>
            <button
              type="button"
              onClick={() => setShowControlsHelp(false)}
              className="text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-2 gap-y-1.5 text-xs text-slate-300">
            <span className="text-slate-400">Déplacement :</span>
            <span>WASD / Flèches</span>
            <span className="text-slate-400">Attaque (A) :</span>
            <span>J / X / Espace</span>
            <span className="text-slate-400">Kikoha (B) :</span>
            <span>K / Clic Droit</span>
            <span className="text-slate-400">Garde / Dash :</span>
            <span>U / C (Nunchuk C)</span>
            <span className="text-slate-400">Kamehameha :</span>
            <span>Touche Q</span>
            <span className="text-slate-400">Genkidama :</span>
            <span>Touche E</span>
            <span className="text-slate-400">Transformation :</span>
            <span>Touche R</span>
            <span className="text-slate-400">Plein écran :</span>
            <span>Touche F</span>
          </div>
          <p className="mt-3 text-[10px] text-slate-500">
            Manettes Xbox, PS5 et Switch Pro détectées automatiquement.
          </p>
        </div>
      )}
    </div>
  );
}
