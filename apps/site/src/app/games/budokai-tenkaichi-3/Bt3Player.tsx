"use client";
// SPDX-License-Identifier: Apache-2.0
/**
 * Dragon Ball Z: Budokai Tenkaichi 3 in the browser, on the Gecko emulation engine (GPL-3.0, WebAssembly +
 * WebGPU) loaded from the CDN. The player's own disc image is read in 8 MiB chunks and never uploaded; the
 * site distributes no game. The engine attaches its canvas to the document: it is moved into the game frame.
 */
import { useRef, useState, type ChangeEvent } from "react";
import { useT } from "@/components/T";
import { GECKO_WASM } from "@/lib/gecko-wasm.generated";

const CHUNK_BYTES = 8 * 1024 * 1024;
const GIB = 1024 ** 3;

interface GeckoModule {
  default(input: { module_or_path: string }): Promise<unknown>;
  begin_game_load(filename: string, expectedSize: number): void;
  append_game_chunk(chunk: Uint8Array): void;
  cancel_game_load(): void;
  start_loaded_game_with_ipl(ipl?: Uint8Array | null): void;
  start_emulator(rom: Uint8Array, filename: string, dspIrom?: Uint8Array | null): void;
}

function wasmUrl(path: string): string {
  const cdn = process.env.NEXT_PUBLIC_CDN_URL?.trim().replace(/\/+$/, "");
  const base = `/wasm/${path}`;
  return process.env.NODE_ENV === "production" && cdn ? `${cdn}${base}` : base;
}

export default function Bt3Player() {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);

  const webgpu = typeof navigator !== "undefined" && "gpu" in navigator;

  function choose(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.currentTarget.files?.[0] ?? null);
    setError("");
  }

  function adoptCanvas(known: Set<Element>) {
    const target = frame.current;
    if (!target) return;
    const started = performance.now();
    const look = () => {
      const canvas = [...document.querySelectorAll("canvas")].find(
        (c) => !known.has(c) && !target.contains(c),
      );
      if (canvas) {
        canvas.style.cssText = "width:100%;height:100%;display:block;";
        target.appendChild(canvas);
      } else if (performance.now() - started < 10_000) requestAnimationFrame(look);
    };
    look();
  }

  async function start() {
    if (!file || busy || running) return;
    setBusy(true);
    setError("");
    let mod: GeckoModule | null = null;
    try {
      mod = (await import(/* webpackIgnore: true */ wasmUrl(GECKO_WASM.js))) as GeckoModule;
      await mod.default({ module_or_path: wasmUrl(GECKO_WASM.wasm) });
      const known = new Set(document.querySelectorAll("canvas"));
      const name = file.name.toLowerCase();
      if (name.endsWith(".rvz")) {
        mod.begin_game_load(file.name, file.size);
        for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
          const end = Math.min(offset + CHUNK_BYTES, file.size);
          mod.append_game_chunk(new Uint8Array(await file.slice(offset, end).arrayBuffer()));
          setProgress(end / file.size);
          setStatus(
            t("communaute.jeux.bt3.reading", {
              done: (end / GIB).toFixed(2),
              total: (file.size / GIB).toFixed(2),
            }),
          );
        }
        setStatus(t("communaute.jeux.bt3.initialising"));
        mod.start_loaded_game_with_ipl(undefined);
      } else {
        setStatus(t("communaute.jeux.bt3.initialising"));
        mod.start_emulator(new Uint8Array(await file.arrayBuffer()), file.name, undefined);
      }
      adoptCanvas(known);
      setProgress(null);
      setStatus(t("communaute.jeux.bt3.running"));
      setRunning(true);
    } catch (cause) {
      try {
        mod?.cancel_game_load();
      } catch {
        /* keep the original error */
      }
      setProgress(null);
      setStatus("");
      setError(t("communaute.jeux.bt3.error", { error: String(cause) }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <p className="max-w-prose rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-white/80">
        {t("communaute.jeux.bt3.experimental")}
      </p>
      {!webgpu && (
        <p role="alert" className="text-sm text-red-300">
          {t("communaute.jeux.bt3.noWebgpu")}
        </p>
      )}
      {!running && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={input}
            type="file"
            accept=".rvz,.iso"
            onChange={choose}
            className="sr-only"
            aria-label={t("communaute.jeux.bt3.pick")}
          />
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="inline-flex min-h-11 items-center rounded-lg border border-white/20 px-4 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {t("communaute.jeux.bt3.pick")}
          </button>
          <span className="text-sm text-white/70">
            {file ? file.name : t("communaute.jeux.bt3.none")}
          </span>
          <button
            type="button"
            disabled={!file || busy || !webgpu}
            onClick={start}
            className="inline-flex min-h-11 items-center rounded-lg bg-dbz-orange px-5 font-semibold text-black focus-visible:outline-2 focus-visible:outline-offset-4 disabled:opacity-40"
          >
            {t("communaute.jeux.bt3.start")}
          </button>
        </div>
      )}
      <p className="text-xs text-white/60">{t("communaute.jeux.bt3.formats")}</p>
      {progress !== null && (
        <progress className="w-full max-w-md" max={1} value={progress} aria-label={status} />
      )}
      <output aria-live="polite" className="block min-h-5 text-sm text-white/80">
        {status}
      </output>
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
      <section
        ref={frame}
        aria-label={t("communaute.jeux.bt3.screen")}
        className="relative aspect-[4/3] w-full max-w-3xl overflow-hidden rounded-xl border border-white/10 bg-black"
      ></section>
      <p className="max-w-prose text-xs text-white/60">
        {t("communaute.jeux.bt3.memory")} {t("communaute.jeux.bt3.legal")}
      </p>
      <p className="text-xs">
        <a
          href="https://github.com/ioncodes/gecko"
          rel="noreferrer"
          className="underline underline-offset-4"
        >
          {t("communaute.jeux.bt3.source")}
        </a>
      </p>
    </section>
  );
}
