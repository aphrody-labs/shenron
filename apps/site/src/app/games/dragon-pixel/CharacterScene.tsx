// SPDX-License-Identifier: Apache-2.0
"use client";

import { useEffect, useRef, useState } from "react";
import {
  createXv2Character,
  type Xv2CharacterRenderer,
} from "@aphrody/shenron-engine/xv2-character";
import { characterCode, characterFiles, fetchBytes, sceneUrl, type SceneIndex } from "./cpk-scene";
import type fr from "../../../../messages/dragon-pixel-scene/fr.json";

const ARCHIVE = "data";
const inputClass = "min-h-11 rounded border border-white/25 bg-slate-950 px-3 text-white";

type Phase = "idle" | "loading" | "ready" | "missing" | "error";

async function loadCharacter(
  code: string,
  canvas: HTMLCanvasElement,
  signal: AbortSignal,
): Promise<Xv2CharacterRenderer | null> {
  const query = new URLSearchParams({ q: `data/chara/${code}/*`, limit: "500" });
  const response = await fetch(`${sceneUrl(ARCHIVE, "find")}?${query}`, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const index = (await response.json()) as SceneIndex;
  if (!Array.isArray(index.entries)) throw new Error("Invalid index");
  const files = characterFiles(
    code,
    index.entries.map((entry) => entry.path),
  );
  if (!files) return null;
  const get = (path: string | undefined) =>
    path ? fetchBytes(sceneUrl(ARCHIVE, "raw", path), signal) : Promise.resolve(undefined);
  const [esk, ean, parts] = await Promise.all([
    fetchBytes(sceneUrl(ARCHIVE, "raw", files.esk), signal),
    fetchBytes(sceneUrl(ARCHIVE, "raw", files.ean), signal),
    Promise.all(
      files.parts.map(async (part) => {
        const [emd, emb, emm, dyt] = await Promise.all([
          fetchBytes(sceneUrl(ARCHIVE, "raw", part.emd), signal),
          get(part.emb),
          get(part.emm),
          get(part.dyt),
        ]);
        return { emd, emb, emm, dyt };
      }),
    ),
  ]);
  return createXv2Character(canvas, esk, ean, parts);
}

export default function CharacterScene({ text }: { text: typeof fr }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<Xv2CharacterRenderer | null>(null);
  const [input, setInput] = useState("APL");
  const [code, setCode] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [animations, setAnimations] = useState<{ name: string; slot: number }[]>([]);
  const [animation, setAnimation] = useState(0);
  const [camera, setCamera] = useState({ rotation: 0, elevation: 0.15, zoom: 1 });

  useEffect(() => {
    const element = canvas.current;
    if (!element || !code) return;
    const controller = new AbortController();
    let handle: Xv2CharacterRenderer | null = null;
    let frame = 0;
    const resize = () => {
      const ratio = Math.min(devicePixelRatio || 1, 2);
      element.width = Math.max(1, Math.round(element.clientWidth * ratio));
      element.height = Math.max(1, Math.round(element.clientHeight * ratio));
      handle?.resize(element.width, element.height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    setPhase("loading");
    void (async () => {
      try {
        handle = await loadCharacter(code, element, controller.signal);
        if (controller.signal.aborted) {
          handle?.free();
          handle = null;
          return;
        }
        if (!handle) {
          setPhase("missing");
          return;
        }
        renderer.current = handle;
        setAnimations(handle.animations().map((name, slot) => ({ name, slot })));
        setAnimation(0);
        setPhase("ready");
        const draw = (time: number) => {
          if (controller.signal.aborted || !handle) return;
          if (!document.hidden && !handle.frame(time / 1000)) {
            setPhase("error");
            return;
          }
          frame = requestAnimationFrame(draw);
        };
        frame = requestAnimationFrame(draw);
      } catch {
        if (!controller.signal.aborted) setPhase("error");
      }
    })();
    return () => {
      controller.abort();
      observer.disconnect();
      cancelAnimationFrame(frame);
      handle?.free();
      renderer.current = null;
    };
  }, [code]);

  useEffect(() => {
    if (phase === "ready") renderer.current?.camera(camera.rotation, camera.elevation, camera.zoom);
  }, [camera, phase]);

  return (
    <section className="space-y-4" aria-labelledby="character-title">
      <h2 id="character-title" className="text-2xl font-bold">
        {text.characterTitle}
      </h2>
      <p className="max-w-3xl text-sm text-white/70">{text.characterHint}</p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const next = characterCode(input);
          if (next) setCode(next);
        }}
      >
        <label className="grid gap-1">
          {text.characterCode}
          <input
            className={inputClass}
            value={input}
            maxLength={8}
            onChange={(event) => setInput(event.currentTarget.value)}
          />
        </label>
        <button
          type="submit"
          className={inputClass}
          disabled={!characterCode(input) || phase === "loading"}
        >
          {phase === "loading" ? text.loading : text.characterLoad}
        </button>
        {phase === "ready" && animations.length > 0 && (
          <label className="grid gap-1">
            {text.animation}
            <select
              className={inputClass}
              value={animation}
              onChange={(event) => {
                const index = Number(event.currentTarget.value);
                setAnimation(index);
                renderer.current?.play(index);
              }}
            >
              {animations.map(({ name, slot }) => (
                <option key={slot} value={slot}>
                  {name || slot}
                </option>
              ))}
            </select>
          </label>
        )}
      </form>
      {code && (
        <canvas
          ref={canvas}
          className="h-[60vh] min-h-72 w-full rounded-xl bg-slate-950"
          aria-label={`${text.characterTitle} ${code}`}
        />
      )}
      {phase === "missing" && <p role="alert">{text.characterMissing}</p>}
      {phase === "error" && <p role="alert">{text.gpu}</p>}
      {phase === "ready" && (
        <div className="grid gap-4 sm:grid-cols-3">
          {(["rotation", "elevation", "zoom"] as const).map((key) => (
            <label key={key} className="grid gap-2">
              {text[key]}
              <input
                type="range"
                min={key === "zoom" ? 0.5 : key === "rotation" ? -Math.PI : -1.4}
                max={key === "zoom" ? 3 : key === "rotation" ? Math.PI : 1.4}
                step="0.01"
                value={camera[key]}
                onChange={(event) =>
                  setCamera({ ...camera, [key]: Number(event.currentTarget.value) })
                }
              />
            </label>
          ))}
        </div>
      )}
    </section>
  );
}
